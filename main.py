from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse, Response
from fastapi.middleware.cors import CORSMiddleware
import os
import tempfile
import subprocess
import shutil
import py7zr

app = FastAPI(title="File Browser API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/browse")
def browse_directory(path: str = Query(..., description="読み込むフォルダの絶対パスまたはUNCパス")):
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="指定されたパスが見つかりません。")
    if not os.path.isdir(path):
        raise HTTPException(status_code=400, detail="指定されたパスはディレクトリではありません。")

    items = []
    try:
        for entry in os.scandir(path):
            try:
                mtime = entry.stat().st_mtime * 1000  # JSのミリ秒タイムスタンプに変換
            except OSError:
                mtime = None
            items.append({
                "name": entry.name,
                "path": entry.path,
                "is_dir": entry.is_dir(),
                "mtime": mtime
            })
    except PermissionError:
        raise HTTPException(status_code=403, detail="このフォルダへのアクセス権限がありません。")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
    return {"path": path, "items": items}

@app.get("/api/thumbnail")
def get_thumbnail(path: str = Query(..., description="画像ファイルの絶対パス")):
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="画像が見つかりません。")
    if os.path.isdir(path):
        raise HTTPException(status_code=400, detail="指定されたパスはディレクトリです。")
    return FileResponse(path)

@app.get("/api/video-thumbnail")
def get_video_thumbnail(path: str = Query(..., description="動画ファイルの絶対パス")):
    """動画の先頭フレームをサムネイル画像として返す"""
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="動画が見つかりません。")
    if os.path.isdir(path):
        raise HTTPException(status_code=400, detail="指定されたパスはディレクトリです。")

    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        raise HTTPException(status_code=500, detail="ffmpegがインストールされていません。")

    fd, temp_path = tempfile.mkstemp(suffix=".jpg")
    os.close(fd)

    try:
        subprocess.run(
            [
                ffmpeg_path, "-i", path,
                "-ss", "00:00:01", "-vframes", "1",
                "-vf", "scale=320:-1",
                "-y", temp_path
            ],
            capture_output=True, timeout=10
        )
        if not os.path.exists(temp_path) or os.path.getsize(temp_path) == 0:
            raise HTTPException(status_code=500, detail="サムネイルの生成に失敗しました。")

        with open(temp_path, "rb") as f:
            data = f.read()
        return Response(content=data, media_type="image/jpeg")
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="サムネイル生成がタイムアウトしました。")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"サムネイル生成エラー: {str(e)}")
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass


def _find_libreoffice():
    """LibreOfficeの実行パスを探す"""
    soffice = shutil.which("soffice")
    if soffice:
        return soffice
    # Windowsの一般的なパス
    candidates = [
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None


def _convert_office_to_pdf(input_path: str) -> bytes:
    """LibreOffice headlessでOfficeファイルをPDFに変換し、バイト列を返す"""
    soffice = _find_libreoffice()
    if not soffice:
        raise HTTPException(status_code=500, detail="LibreOfficeがインストールされていません。Office系ファイルのプレビューにはLibreOfficeが必要です。")

    temp_dir = tempfile.mkdtemp()
    try:
        subprocess.run(
            [
                soffice,
                "--headless",
                "--convert-to", "pdf",
                "--outdir", temp_dir,
                input_path
            ],
            capture_output=True, timeout=60
        )

        base_name = os.path.splitext(os.path.basename(input_path))[0]
        pdf_path = os.path.join(temp_dir, base_name + ".pdf")

        if not os.path.exists(pdf_path):
            raise HTTPException(status_code=500, detail="PDF変換に失敗しました。")

        with open(pdf_path, "rb") as f:
            return f.read()
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="PDF変換がタイムアウトしました。")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF変換エラー: {str(e)}")
    finally:
        import shutil as _shutil
        _shutil.rmtree(temp_dir, ignore_errors=True)


@app.get("/api/office-preview")
def office_preview(path: str = Query(..., description="Officeファイルの絶対パス")):
    """Office系ファイルをPDFに変換して返す"""
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="ファイルが見つかりません。")
    if os.path.isdir(path):
        raise HTTPException(status_code=400, detail="指定されたパスはディレクトリです。")

    pdf_data = _convert_office_to_pdf(path)
    return Response(content=pdf_data, media_type="application/pdf")


@app.get("/api/office-thumbnail")
def office_thumbnail(path: str = Query(..., description="Officeファイルの絶対パス")):
    """Office系ファイルのサムネイル画像を返す。pptx/docx/xlsxの埋め込みサムネイルを優先し、なければLibreOffice変換"""
    import zipfile

    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="ファイルが見つかりません。")
    if os.path.isdir(path):
        raise HTTPException(status_code=400, detail="指定されたパスはディレクトリです。")

    # Office Open XML (.pptx, .docx, .xlsx) はZIPなので埋め込みサムネイルを試す
    if path.lower().endswith(('.pptx', '.docx', '.xlsx')):
        try:
            with zipfile.ZipFile(path) as z:
                for name in z.namelist():
                    if 'thumbnail' in name.lower() and name.lower().endswith(('.jpeg', '.jpg', '.png')):
                        data = z.read(name)
                        ext = name.rsplit('.', 1)[-1].lower()
                        media = "image/jpeg" if ext in ('jpg', 'jpeg') else "image/png"
                        return Response(content=data, media_type=media)
        except Exception:
            pass  # ZIPから取れなければフォールバック

    # フォールバック: LibreOfficeでPDF→ffmpegで先頭ページを画像化
    try:
        pdf_data = _convert_office_to_pdf(path)
    except HTTPException:
        raise

    # PDFの先頭ページをffmpegで画像化
    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        raise HTTPException(status_code=500, detail="ffmpegがインストールされていません。")

    fd_pdf, temp_pdf = tempfile.mkstemp(suffix=".pdf")
    fd_img, temp_img = tempfile.mkstemp(suffix=".jpg")
    os.close(fd_pdf)
    os.close(fd_img)

    try:
        with open(temp_pdf, "wb") as f:
            f.write(pdf_data)

        subprocess.run(
            [
                ffmpeg_path, "-i", temp_pdf,
                "-frames:v", "1",
                "-vf", "scale=320:-1",
                "-y", temp_img
            ],
            capture_output=True, timeout=15
        )

        if not os.path.exists(temp_img) or os.path.getsize(temp_img) == 0:
            raise HTTPException(status_code=500, detail="サムネイル生成に失敗しました。")

        with open(temp_img, "rb") as f:
            data = f.read()
        return Response(content=data, media_type="image/jpeg")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"サムネイル生成エラー: {str(e)}")
    finally:
        for p in (temp_pdf, temp_img):
            try:
                os.remove(p)
            except OSError:
                pass

@app.get("/api/content")
def get_file_content(path: str = Query(..., description="テキストファイルの絶対パス")):
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="ファイルが見つかりません。")
    if os.path.isdir(path):
        raise HTTPException(status_code=400, detail="指定されたパスはディレクトリです。")

    MAX_SIZE = 5 * 1024 * 1024 # 5MB
    if os.path.getsize(path) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="ファイルサイズが大きすぎるため、プレビューできません。")

    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        return PlainTextResponse(content)
    except UnicodeDecodeError:
        try:
             with open(path, 'r', encoding='shift_jis') as f:
                content = f.read()
             return PlainTextResponse(content)
        except Exception:
             raise HTTPException(status_code=400, detail="テキストとして読み込めないファイル形式です。")
    except PermissionError:
        raise HTTPException(status_code=403, detail="このファイルへのアクセス権限がありません。")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- ★追加: ダウンロード用エンドポイント ---

@app.get("/api/download/file")
def download_file(path: str = Query(..., description="ダウンロードするファイルの絶対パス")):
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="ファイルが見つかりません。")
    if os.path.isdir(path):
        raise HTTPException(status_code=400, detail="指定されたパスはディレクトリです。/api/download/folder を使用してください。")
    
    filename = os.path.basename(path)
    return FileResponse(path, filename=filename, media_type="application/octet-stream")

@app.get("/api/download/folder")
def download_folder_7z(path: str = Query(..., description="7zで圧縮してダウンロードするフォルダの絶対パス")):
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="フォルダが見つかりません。")
    if not os.path.isdir(path):
        raise HTTPException(status_code=400, detail="指定されたパスはディレクトリではありません。")

    folder_name = os.path.basename(os.path.normpath(path))
    if not folder_name:
         folder_name = "archive" # ルートディレクトリなどのフォールバック

    # 一時ファイルとして 7z アーカイブを作成
    # Windows等で確実に削除されるように delete=False にし、StreamingResponseのあとにOS側で消す処理が必要ですが、
    # ここでは簡易的に tempfile を生成し、BackgroundTasks で消すか、ストリーミング後に消すかなどを実装します。
    # 最も単純な方法は、一時ディレクトリに作って yield して消すジェネレータを使うことです。

    def iter_and_delete_temp_file(filepath):
        try:
            with open(filepath, "rb") as f:
                while chunk := f.read(8192):
                    yield chunk
        finally:
            try:
                os.remove(filepath)
            except OSError:
                pass

    try:
        # 一時ファイルのパスを生成 (自動削除されないように設定し、読み取り後に手動で削除)
        fd, temp_path = tempfile.mkstemp(suffix=".7z")
        os.close(fd) # mkstempが開いたファイルディスクリプタを閉じる
        
        with py7zr.SevenZipFile(temp_path, 'w') as archive:
            # フォルダ全体を追加 (第2引数はアーカイブ内のトップディレクトリ名)
            archive.writeall(path, folder_name)
            
        return StreamingResponse(
            iter_and_delete_temp_file(temp_path),
            media_type="application/x-7z-compressed",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{folder_name}.7z"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"圧縮処理中にエラーが発生しました: {str(e)}")