import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { 
  QueryClient, 
  QueryClientProvider, 
  useQuery 
} from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { 
  Folder, FileText, Check, AlertCircle, Loader2, Send, 
  LayoutGrid, List, ArrowLeft, ArrowRight, ArrowUp, Image as ImageIcon,
  X, Copy, Star, Search, Download, Music, Film, FileType,
  FileSpreadsheet, Presentation, BookOpen
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const API_BASE_URL = 'http://localhost:8000';
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, 
      cacheTime: 30 * 60 * 1000, 
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// モックデータ（バックエンドがない場合のフォールバック用）
const getMockData = (path) => {
  const now = Date.now();
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        items: [
          // ★変更: ソートテスト用に mtime (更新日時のタイムスタンプ) を追加
          { name: 'SubFolder_A', path: `${path}\\SubFolder_A`, is_dir: true, mtime: now - 86400000 * 5 }, // 5日前
          { name: 'Design_Assets', path: `${path}\\Design_Assets`, is_dir: true, mtime: now - 86400000 * 2 }, // 2日前
          { name: 'readme.txt', path: `${path}\\readme.txt`, is_dir: false, mtime: now - 3600000 }, // 1時間前
          { name: 'document_final.pdf', path: `${path}\\document_final.pdf`, is_dir: false, mtime: now - 86400000 * 10 }, // 10日前
          { name: 'holiday_photo.jpg', path: `${path}\\holiday_photo.jpg`, is_dir: false, mtime: now - 86400000 * 1 }, // 1日前
          { name: 'data_export_2026.csv', path: `${path}\\data_export_2026.csv`, is_dir: false, mtime: now - 86400000 * 3 }, // 3日前
          { name: 'presentation_draft.pptx', path: `${path}\\presentation_draft.pptx`, is_dir: false, mtime: now - 86400000 * 4 }, // 4日前
        ]
      });
    }, 300);
  });
};

const fetchDirectory = async (path) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/browse?path=${encodeURIComponent(path)}`);
    if (!response.ok) throw new Error('API Error');
    const data = await response.json();
    return data.items;
  } catch (err) {
    console.warn("Using mock data due to API unavailability.");
    const mock = await getMockData(path);
    return mock.items;
  }
};

const fetchFileContent = async (path) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/content?path=${encodeURIComponent(path)}`);
    if (!response.ok) throw new Error('API Error');
    const text = await response.text();
    return text;
  } catch (err) {
    console.warn("Using mock text data due to API unavailability.");
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(`【モックテキストデータ】\n\nファイル名: ${path.split(/[/\\]/).pop()}\nフルパス: ${path}\n\nこのプレビューはダミーです。\nバックエンドAPIにテキストの中身を返す機能（/api/content等）を実装することで、\n実際のテキストファイルの内容をここに表示させることができます。\n\nQuickLook のテキストプレビュー機能は正常に動作しています！`);
      }, 400); 
    });
  }
};

const isImageFile = (name) => {
  return /\.(jpe?g|png|gif|webp|bmp)$/i.test(name);
};

const isSvgFile = (name) => {
  return /\.svg$/i.test(name);
};

const isVideoFile = (name) => {
  return /\.(mp4|webm|mov|avi|mkv|wmv|flv|m4v)$/i.test(name);
};

const isAudioFile = (name) => {
  return /\.(mp3|wav|ogg|flac|aac|m4a|wma|opus)$/i.test(name);
};

const isPdfFile = (name) => {
  return /\.pdf$/i.test(name);
};

const isMarkdownFile = (name) => {
  return /\.md$/i.test(name);
};

const isOfficeFile = (name) => {
  return /\.(pptx?|xlsx?|docx?)$/i.test(name);
};

const isPptFile = (name) => {
  return /\.pptx?$/i.test(name);
};

const isExcelFile = (name) => {
  return /\.xlsx?$/i.test(name);
};

const isWordFile = (name) => {
  return /\.docx?$/i.test(name);
};

const isTextFile = (name) => {
  return /\.(txt|csv|json|js|jsx|html|css|py|log|xml)$/i.test(name);
};

// 共通の色相(Hue)計算関数
const getIconHue = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash % 360);
};

// フォルダ名から塗りつぶしカラーを生成
const getFolderColorStyle = (folderName, isFocused = false) => {
  if (isFocused) return {}; 
  const hue = getIconHue(folderName);
  return {
    fill: `hsl(${hue}, 82%, 75%)`,
    color: `hsl(${hue}, 77%, 55%)`
  };
};

// ファイル名からラインカラーを生成
const getFileColorStyle = (fileName, isFocused = false) => {
  if (isFocused) return {}; 
  const hue = getIconHue(fileName);
  return {
    color: `hsl(${hue}, 75%, 50%)`
  };
};

const formatDate = (timestamp) => {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const getPreviewUrl = (filePath) => {
  return `${API_BASE_URL}/api/thumbnail?path=${encodeURIComponent(filePath)}`;
};

const getVideoThumbnailUrl = (filePath) => {
  return `${API_BASE_URL}/api/video-thumbnail?path=${encodeURIComponent(filePath)}`;
};

const getStreamUrl = (filePath) => {
  return `${API_BASE_URL}/api/thumbnail?path=${encodeURIComponent(filePath)}`;
};

const getOfficePreviewUrl = (filePath) => {
  return `${API_BASE_URL}/api/office-preview?path=${encodeURIComponent(filePath)}`;
};

const getOfficeThumbnailUrl = (filePath) => {
  return `${API_BASE_URL}/api/office-thumbnail?path=${encodeURIComponent(filePath)}`;
};

const fallbackImageSrc = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpolyline points='21 15 16 10 5 21'/%3E%3C/svg%3E";

const FolderPreview = ({ path, folderName }) => {
  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ['directory', path],
    queryFn: () => fetchDirectory(path),
  });

  return (
    <div className="bg-[#fafafa] flex flex-col shadow-2xl rounded-2xl w-full max-w-4xl h-[75vh] overflow-hidden">
      <div className="bg-[#ebebeb] px-6 py-4 border-b border-[#d8d8d8] flex items-center shrink-0">
        <Folder className="w-6 h-6 mr-3 drop-shadow-sm" style={getFolderColorStyle(folderName)} />
        <h2 className="text-lg font-bold text-slate-800 truncate">{folderName}</h2>
        {!isLoading && !error && (
          <span className="ml-auto text-xs font-medium text-slate-500 bg-white px-3 py-1 rounded-md shadow-sm border border-[#d8d8d8]">
            {items.length} 項目
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto bg-white p-2 custom-scrollbar">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin mb-3 text-[#3584e4]" />
            <p>内容を読み込み中...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-amber-600 bg-amber-50 m-4 rounded-xl border border-amber-200">
            <AlertCircle className="w-8 h-8 mb-2" />
            <p>読み込みに失敗しました</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Folder className="w-16 h-16 mb-4 text-[#d8d8d8]" />
            <p>このフォルダーは空です</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 px-2">
            {items.map(item => (
              <li key={item.path} className="flex items-center px-4 py-2.5 hover:bg-[#ebebeb] rounded-lg transition-colors group cursor-default">
                <div className="mr-4 shrink-0">
                  {item.is_dir ? (
                    <Folder className="w-6 h-6 drop-shadow-sm" style={getFolderColorStyle(item.name)} />
                  ) : isImageFile(item.name) ? (
                    <ImageIcon className="w-6 h-6 text-[#8cb6f5]" />
                  ) : (
                    <FileText className="w-6 h-6 drop-shadow-sm" style={getFileColorStyle(item.name)} />
                  )}
                </div>
                <span className="text-sm text-slate-700 truncate flex-1">{item.name}</span>
                <span className="text-xs text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  {item.is_dir ? 'フォルダー' : 'ファイル'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

const ExplorerView = ({ 
  currentPath, 
  onNavigate, 
  onGoUp, 
  selectedFiles, 
  toggleFileSelect,
  onAddMultipleFiles, 
  viewMode,
  iconSize,
  setIconSize,
  filterText,
  sortOption // ★追加: ソートのオプション
}) => {
  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ['directory', currentPath],
    queryFn: () => fetchDirectory(currentPath),
  });

  const parentRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(800);
  
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [lastInteractionIndex, setLastInteractionIndex] = useState(0); 
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  
  const [previewText, setPreviewText] = useState("");
  const [isPreviewTextLoading, setIsPreviewTextLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);

  // ★変更: フィルターとソートを組み合わせた配列を生成
  const sortedAndFilteredItems = useMemo(() => {
    let result = items;
    
    // 1. フィルター
    if (filterText) {
      const lowerFilter = filterText.toLowerCase();
      result = result.filter(item => item.name.toLowerCase().includes(lowerFilter));
    }
    
    // 2. ソート
    result = [...result].sort((a, b) => {
      // 常にフォルダを優先して上に表示
      if (a.is_dir !== b.is_dir) {
        return a.is_dir ? -1 : 1;
      }
      
      switch (sortOption) {
        case 'name_desc':
          return b.name.localeCompare(a.name);
        case 'date_asc':
          return (a.mtime || 0) - (b.mtime || 0);
        case 'date_desc':
          return (b.mtime || 0) - (a.mtime || 0);
        case 'name_asc':
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return result;
  }, [items, filterText, sortOption]);

  useEffect(() => {
    const closeContextMenu = () => setContextMenu(null);
    document.addEventListener('click', closeContextMenu);
    return () => document.removeEventListener('click', closeContextMenu);
  }, []);

  useEffect(() => {
    setFocusedIndex(0);
    setLastInteractionIndex(0); 
  }, [currentPath, filterText, sortOption]);

  useEffect(() => {
    if (!isLoading && parentRef.current) {
      const timer = setTimeout(() => {
        if (parentRef.current) parentRef.current.focus();
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [isLoading, currentPath]);

  useEffect(() => {
    const currentItem = sortedAndFilteredItems[focusedIndex];
    if (isPreviewOpen && currentItem && (isTextFile(currentItem.name) || isMarkdownFile(currentItem.name))) {
      setIsPreviewTextLoading(true);
      fetchFileContent(currentItem.path)
        .then(text => {
          setPreviewText(text);
          setIsPreviewTextLoading(false);
        })
        .catch(err => {
          setPreviewText("ファイルの読み込みに失敗しました。");
          setIsPreviewTextLoading(false);
        });
    }
  }, [isPreviewOpen, focusedIndex, sortedAndFilteredItems]);

  useEffect(() => {
    const container = parentRef.current;
    if (!container) return;
    setContainerWidth(container.getBoundingClientRect().width);
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries[0]) setContainerWidth(entries[0].contentRect.width);
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        setIconSize(prev => Math.min(Math.max(prev - e.deltaY * 0.2, 48), 256));
      }
    };
    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, [setIconSize]);

  const isList = viewMode === 'list';
  const cellWidth = isList ? containerWidth : iconSize + 24;
  const columns = isList ? 1 : Math.max(1, Math.floor(containerWidth / cellWidth));
  const cellHeight = isList ? 48 : iconSize + 56;
  const rowCount = Math.ceil(sortedAndFilteredItems.length / columns);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => cellHeight,
    overscan: 5,
  });

  const handleKeyDown = (e) => {
    if (!sortedAndFilteredItems || sortedAndFilteredItems.length === 0) return;

    if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowUp')) {
      e.preventDefault();
      setIsPreviewOpen(false);
      if (onGoUp) onGoUp();
      return;
    }

    let newIndex = focusedIndex;
    const cols = isList ? 1 : columns;

    switch (e.key) {
      case 'ArrowRight':
        if (!isList) newIndex = Math.min(focusedIndex + 1, sortedAndFilteredItems.length - 1);
        break;
      case 'ArrowLeft':
        if (!isList) newIndex = Math.max(focusedIndex - 1, 0);
        break;
      case 'ArrowDown':
        newIndex = Math.min(focusedIndex + cols, sortedAndFilteredItems.length - 1);
        break;
      case 'ArrowUp':
        newIndex = Math.max(focusedIndex - cols, 0);
        break;
      case 'Enter':
        e.preventDefault();
        const item = sortedAndFilteredItems[focusedIndex];
        if (item) {
          if (e.shiftKey) {
            const start = Math.min(lastInteractionIndex, focusedIndex);
            const end = Math.max(lastInteractionIndex, focusedIndex);
            const pathsToAdd = [];
            for (let i = start; i <= end; i++) {
              pathsToAdd.push(sortedAndFilteredItems[i].path);
            }
            onAddMultipleFiles(pathsToAdd);
          } else if (e.ctrlKey || e.metaKey) {
            toggleFileSelect(item.path);
            setLastInteractionIndex(focusedIndex);
          } else {
            if (item.is_dir) {
              setIsPreviewOpen(false);
              onNavigate(item.path);
            } else {
              toggleFileSelect(item.path);
              setLastInteractionIndex(focusedIndex);
            }
          }
        }
        break;
      case ' ':
        e.preventDefault();
        setIsPreviewOpen(!isPreviewOpen);
        return;
      case 'Escape':
        if (isPreviewOpen) {
          setIsPreviewOpen(false);
          if (parentRef.current) parentRef.current.focus();
        }
        return;
      default:
        return;
    }

    if (newIndex !== focusedIndex) {
      e.preventDefault();
      setFocusedIndex(newIndex);
      virtualizer.scrollToIndex(Math.floor(newIndex / cols));
    }
  };

  const handleItemClick = (e, index, path) => {
    e.stopPropagation();
    setFocusedIndex(index);
    
    if (e.shiftKey) {
      const start = Math.min(lastInteractionIndex, index);
      const end = Math.max(lastInteractionIndex, index);
      const pathsToAdd = [];
      for (let i = start; i <= end; i++) {
        pathsToAdd.push(sortedAndFilteredItems[i].path);
      }
      onAddMultipleFiles(pathsToAdd);
    } else if (e.ctrlKey || e.metaKey) {
      toggleFileSelect(path);
      setLastInteractionIndex(index);
    } else {
      setLastInteractionIndex(index);
    }
    
    if (parentRef.current) parentRef.current.focus();
  };

  const handleContextMenu = (e, index, item) => {
    e.preventDefault();
    setFocusedIndex(index);
    setLastInteractionIndex(index);
    setContextMenu({
      mouseX: e.clientX,
      mouseY: e.clientY,
      item: item
    });
  };

  const handleCopyPath = () => {
    if (!contextMenu?.item) return;
    const path = contextMenu.item.path;
    const textArea = document.createElement("textarea");
    textArea.value = path;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try { document.execCommand('copy'); } catch (err) { console.error(err); }
    document.body.removeChild(textArea);
    setContextMenu(null);
  };

  const handleDownload = () => {
    if (!contextMenu?.item) return;
    const item = contextMenu.item;
    
    let downloadUrl;
    if (item.is_dir) {
      downloadUrl = `${API_BASE_URL}/api/download/folder?path=${encodeURIComponent(item.path)}`;
    } else {
      downloadUrl = `${API_BASE_URL}/api/download/file?path=${encodeURIComponent(item.path)}`;
    }

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = item.name; 
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setContextMenu(null);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-[#3584e4]" />
        <p>ディレクトリを読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-amber-600 bg-amber-50 m-4 rounded-xl border border-amber-200">
        <AlertCircle className="w-8 h-8 mb-2" />
        <p>エラーが発生しました</p>
      </div>
    );
  }

  if (sortedAndFilteredItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 focus:outline-none" tabIndex={0} ref={parentRef} onKeyDown={handleKeyDown}>
        <Folder className="w-16 h-16 mb-4 text-[#d8d8d8]" />
        <p>{items.length > 0 ? 'フィルターに一致するアイテムがありません。' : 'このフォルダーは空です。'}</p>
      </div>
    );
  }

  return (
    <>
      <div 
        ref={parentRef} 
        tabIndex={0} 
        onKeyDown={handleKeyDown}
        className="h-full overflow-y-auto w-full custom-scrollbar bg-[#fafafa] p-4 focus:outline-none"
        style={{ contain: 'strict' }}
      >
        <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const fromIndex = virtualRow.index * columns;
            const rowItems = sortedAndFilteredItems.slice(fromIndex, fromIndex + columns); 

            return (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute', top: 0, left: 0, width: '100%', height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`, display: 'flex', flexDirection: 'row',
                }}
              >
                {rowItems.map((item, i) => {
                  const itemIndex = fromIndex + i;
                  const isSelected = selectedFiles.has(item.path);
                  const isFocused = focusedIndex === itemIndex;
                  
                  if (isList) {
                    return (
                      <div
                        key={item.path}
                        onDoubleClick={() => { if(item.is_dir) onNavigate(item.path); }}
                        onClick={(e) => handleItemClick(e, itemIndex, item.path)}
                        onContextMenu={(e) => handleContextMenu(e, itemIndex, item)}
                        title={item.name}
                        className={`flex items-center w-full px-4 py-2 cursor-pointer select-none group transition-all rounded-lg mb-1 
                          ${isFocused ? 'bg-[#3584e4] text-white shadow-sm' : 'hover:bg-[#ebebeb] text-slate-800'}
                        `}
                      >
                        <div className="mr-4 shrink-0 relative">
                          {item.is_dir ? <Folder className={`w-6 h-6 ${isFocused ? 'fill-blue-200 text-white' : ''}`} style={getFolderColorStyle(item.name, isFocused)} /> : 
                           isImageFile(item.name) || isSvgFile(item.name) ? <ImageIcon className={`w-6 h-6 ${isFocused ? 'text-blue-100' : 'text-[#8cb6f5]'}`} /> : 
                           isVideoFile(item.name) ? <Film className={`w-6 h-6 ${isFocused ? 'text-blue-100' : 'text-purple-500'}`} /> :
                           isAudioFile(item.name) ? <Music className={`w-6 h-6 ${isFocused ? 'text-blue-100' : 'text-pink-500'}`} /> :
                           isPdfFile(item.name) ? <FileType className={`w-6 h-6 ${isFocused ? 'text-blue-100' : 'text-red-500'}`} /> :
                           isMarkdownFile(item.name) ? <BookOpen className={`w-6 h-6 ${isFocused ? 'text-blue-100' : 'text-sky-600'}`} /> :
                           isPptFile(item.name) ? <Presentation className={`w-6 h-6 ${isFocused ? 'text-blue-100' : 'text-orange-500'}`} /> :
                           isExcelFile(item.name) ? <FileSpreadsheet className={`w-6 h-6 ${isFocused ? 'text-blue-100' : 'text-green-600'}`} /> :
                           isWordFile(item.name) ? <FileText className={`w-6 h-6 ${isFocused ? 'text-blue-100' : 'text-blue-600'}`} /> :
                           <FileText className={`w-6 h-6 ${isFocused ? 'text-blue-100' : ''}`} style={getFileColorStyle(item.name, isFocused)} />}
                           
                          {isSelected && <Star className="w-4 h-4 text-amber-400 fill-amber-400 absolute -top-2 -right-2 drop-shadow-sm" />}
                        </div>
                        <span className={`text-sm truncate flex-1 ${isSelected && !isFocused ? 'font-bold text-[#3584e4]' : ''} ${isSelected && isFocused ? 'font-bold text-white' : ''}`}>
                          {item.name}
                        </span>
                        <span className={`text-xs shrink-0 ml-4 tabular-nums ${isFocused ? 'text-blue-100' : 'text-slate-400'}`}>
                          {formatDate(item.mtime)}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div key={item.path} style={{ width: `${100 / columns}%`, height: '100%' }} className="p-1">
                      <div
                        onDoubleClick={() => { if(item.is_dir) onNavigate(item.path); }}
                        onClick={(e) => handleItemClick(e, itemIndex, item.path)}
                        onContextMenu={(e) => handleContextMenu(e, itemIndex, item)}
                        title={item.name}
                        className={`flex flex-col items-center justify-start h-full p-2 rounded-xl cursor-pointer select-none transition-all relative
                          ${isFocused ? 'bg-[#3584e4] text-white shadow-sm' : 'hover:bg-[#ebebeb] text-slate-800'}
                        `}
                      >
                        <div 
                          style={{ width: iconSize, height: iconSize }} 
                          className={`flex items-center justify-center mb-1.5 overflow-hidden rounded-lg relative ${!item.is_dir && (isImageFile(item.name) || isSvgFile(item.name) || isVideoFile(item.name) || isOfficeFile(item.name)) && !isFocused ? 'shadow-sm border border-black/5 bg-white' : ''}`}
                        >
                          {item.is_dir ? (
                            <Folder size={iconSize * 0.85} strokeWidth={1} className={isFocused ? 'fill-blue-200 text-white' : 'drop-shadow-sm'} style={getFolderColorStyle(item.name, isFocused)} />
                          ) : isImageFile(item.name) ? (
                            <img 
                              src={getPreviewUrl(item.path)} 
                              alt={item.name} 
                              className={`w-full h-full object-cover transition-transform ${isFocused ? 'opacity-90' : ''}`}
                              loading="lazy"
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = fallbackImageSrc;
                                e.target.className = "w-1/2 h-1/2 opacity-40";
                              }}
                            />
                          ) : isSvgFile(item.name) ? (
                            <img 
                              src={getPreviewUrl(item.path)} 
                              alt={item.name} 
                              className={`w-3/4 h-3/4 object-contain transition-transform ${isFocused ? 'opacity-90' : ''}`}
                              loading="lazy"
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = fallbackImageSrc;
                                e.target.className = "w-1/2 h-1/2 opacity-40";
                              }}
                            />
                          ) : isVideoFile(item.name) ? (
                            <div className="relative w-full h-full">
                              <img 
                                src={getVideoThumbnailUrl(item.path)} 
                                alt={item.name} 
                                className={`w-full h-full object-cover transition-transform ${isFocused ? 'opacity-90' : ''}`}
                                loading="lazy"
                                onError={(e) => {
                                  e.target.onerror = null;
                                  e.target.src = fallbackImageSrc;
                                  e.target.className = "w-1/2 h-1/2 opacity-40";
                                }}
                              />
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="bg-black/50 rounded-full p-1.5">
                                  <Film className="w-4 h-4 text-white" />
                                </div>
                              </div>
                            </div>
                          ) : isOfficeFile(item.name) ? (
                            <img 
                              src={getOfficeThumbnailUrl(item.path)} 
                              alt={item.name} 
                              className={`w-full h-full object-contain transition-transform ${isFocused ? 'opacity-90' : ''}`}
                              loading="lazy"
                              onError={(e) => {
                                e.target.onerror = null;
                                // Fallback to icon on thumbnail error
                                e.target.style.display = 'none';
                                e.target.parentElement.innerHTML = '';
                                // Let the parent re-render handle it
                              }}
                            />
                          ) : (
                            <FileText size={iconSize * 0.6} strokeWidth={1} className={isFocused ? 'text-blue-200' : 'drop-shadow-sm'} style={getFileColorStyle(item.name, isFocused)} />
                          )}

                          {isSelected && (
                            <div className="absolute top-1 right-1 z-10 bg-white/90 backdrop-blur-sm rounded-full p-0.5 shadow-sm border border-black/5">
                              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                            </div>
                          )}
                        </div>
                        <span className={`text-xs text-center w-full px-1 break-words line-clamp-2 ${isSelected && !isFocused ? 'font-bold text-[#3584e4]' : ''} ${isSelected && isFocused ? 'font-bold text-white' : ''}`}>
                          {item.name}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {contextMenu && (
        <div 
          className="fixed z-[100] bg-white border border-[#d8d8d8] shadow-xl rounded-md py-1 min-w-[180px] text-sm text-slate-800"
          style={{ top: contextMenu.mouseY, left: contextMenu.mouseX }}
          onClick={(e) => e.stopPropagation()} 
        >
          <div className="px-4 py-2 border-b border-[#ebebeb] text-xs font-semibold text-slate-500 truncate" title={contextMenu.item.name}>
            {contextMenu.item.name}
          </div>
          <button 
            className="w-full text-left px-4 py-2 hover:bg-[#3584e4] hover:text-white transition-colors flex items-center"
            onClick={handleCopyPath}
          >
            <Copy className="w-4 h-4 mr-2 opacity-70" />
            パスをコピー
          </button>
          
          <button 
            className="w-full text-left px-4 py-2 hover:bg-[#3584e4] hover:text-white transition-colors flex items-center"
            onClick={handleDownload}
          >
            <Download className="w-4 h-4 mr-2 opacity-70" />
            ダウンロード{contextMenu.item.is_dir && ' (7z)'}
          </button>
        </div>
      )}

      {isPreviewOpen && sortedAndFilteredItems[focusedIndex] && (
        <div 
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-6 md:p-16 transition-opacity animate-in fade-in duration-200"
          onClick={() => {
            setIsPreviewOpen(false);
            if (parentRef.current) parentRef.current.focus();
          }}
        >
          <div 
            className="relative flex flex-col items-center justify-center max-w-6xl w-full max-h-full outline-none"
            onClick={e => e.stopPropagation()}
          >
            <button 
              onClick={() => {
                setIsPreviewOpen(false);
                if (parentRef.current) parentRef.current.focus();
              }}
              className="absolute -top-12 right-0 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full backdrop-blur-sm transition-colors flex items-center gap-2 text-sm px-4"
            >
              <X className="w-4 h-4" /> 閉じる (Space / Esc)
            </button>

            {sortedAndFilteredItems[focusedIndex].is_dir ? (
              <FolderPreview path={sortedAndFilteredItems[focusedIndex].path} folderName={sortedAndFilteredItems[focusedIndex].name} />
            ) : isImageFile(sortedAndFilteredItems[focusedIndex].name) ? (
              <div className="flex flex-col items-center w-full h-full">
                <img 
                  src={getPreviewUrl(sortedAndFilteredItems[focusedIndex].path)} 
                  alt={sortedAndFilteredItems[focusedIndex].name}
                  className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl ring-1 ring-white/10"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = fallbackImageSrc;
                    e.target.className = "w-32 h-32 opacity-50 bg-white p-4 rounded-xl";
                  }}
                />
                <h2 className="text-white mt-6 text-lg font-medium drop-shadow-md bg-black/40 px-6 py-2 rounded-full max-w-2xl truncate border border-white/10">
                  {sortedAndFilteredItems[focusedIndex].name}
                </h2>
              </div>
            ) : isSvgFile(sortedAndFilteredItems[focusedIndex].name) ? (
              <div className="flex flex-col items-center w-full h-full">
                <div className="bg-white rounded-xl shadow-2xl ring-1 ring-white/10 p-8 max-w-[80vw] max-h-[80vh] overflow-auto">
                  <img 
                    src={getPreviewUrl(sortedAndFilteredItems[focusedIndex].path)} 
                    alt={sortedAndFilteredItems[focusedIndex].name}
                    className="max-w-full max-h-[70vh] object-contain"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = fallbackImageSrc;
                      e.target.className = "w-32 h-32 opacity-50";
                    }}
                  />
                </div>
                <h2 className="text-white mt-6 text-lg font-medium drop-shadow-md bg-black/40 px-6 py-2 rounded-full max-w-2xl truncate border border-white/10">
                  {sortedAndFilteredItems[focusedIndex].name}
                </h2>
              </div>
            ) : isVideoFile(sortedAndFilteredItems[focusedIndex].name) ? (
              <div className="flex flex-col items-center w-full h-full">
                <video 
                  src={getStreamUrl(sortedAndFilteredItems[focusedIndex].path)} 
                  controls
                  autoPlay
                  className="max-w-full max-h-[80vh] rounded-xl shadow-2xl ring-1 ring-white/10 bg-black"
                />
                <h2 className="text-white mt-6 text-lg font-medium drop-shadow-md bg-black/40 px-6 py-2 rounded-full max-w-2xl truncate border border-white/10">
                  {sortedAndFilteredItems[focusedIndex].name}
                </h2>
              </div>
            ) : isAudioFile(sortedAndFilteredItems[focusedIndex].name) ? (
              <div className="bg-[#fafafa] p-12 rounded-3xl flex flex-col items-center shadow-2xl min-w-[380px]">
                <Music className="w-24 h-24 mb-6 text-pink-500 drop-shadow-xl" />
                <h2 className="text-xl font-bold text-slate-800 break-all text-center max-w-lg mb-6">{sortedAndFilteredItems[focusedIndex].name}</h2>
                <audio 
                  src={getStreamUrl(sortedAndFilteredItems[focusedIndex].path)} 
                  controls
                  autoPlay
                  className="w-full max-w-md"
                />
              </div>
            ) : isPdfFile(sortedAndFilteredItems[focusedIndex].name) ? (
              <div className="bg-[#fafafa] flex flex-col shadow-2xl rounded-2xl w-full max-w-4xl h-[85vh] overflow-hidden">
                <div className="bg-[#ebebeb] px-6 py-4 border-b border-[#d8d8d8] flex items-center shrink-0">
                  <FileType className="w-6 h-6 mr-3 text-red-500" />
                  <h2 className="text-lg font-bold text-slate-800 truncate">{sortedAndFilteredItems[focusedIndex].name}</h2>
                </div>
                <iframe
                  src={getStreamUrl(sortedAndFilteredItems[focusedIndex].path)}
                  className="flex-1 w-full bg-white"
                  title={sortedAndFilteredItems[focusedIndex].name}
                />
              </div>
            ) : isMarkdownFile(sortedAndFilteredItems[focusedIndex].name) ? (
              <div className="bg-[#fafafa] flex flex-col shadow-2xl rounded-2xl w-full max-w-4xl h-[75vh] overflow-hidden">
                <div className="bg-[#ebebeb] px-6 py-4 border-b border-[#d8d8d8] flex items-center shrink-0">
                  <BookOpen className="w-6 h-6 mr-3 text-sky-600" />
                  <h2 className="text-lg font-bold text-slate-800 truncate">{sortedAndFilteredItems[focusedIndex].name}</h2>
                </div>
                <div className="flex-1 p-6 overflow-y-auto bg-white">
                  {isPreviewTextLoading ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                      <Loader2 className="w-8 h-8 animate-spin mb-3 text-[#3584e4]" />
                      <p>Markdownを読み込み中...</p>
                    </div>
                  ) : (
                    <div className="prose prose-slate max-w-none prose-headings:text-slate-800 prose-a:text-blue-600 prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-slate-900 prose-pre:text-slate-200 prose-img:rounded-lg">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{previewText}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ) : isOfficeFile(sortedAndFilteredItems[focusedIndex].name) ? (
              <div className="bg-[#fafafa] flex flex-col shadow-2xl rounded-2xl w-full max-w-4xl h-[85vh] overflow-hidden">
                <div className="bg-[#ebebeb] px-6 py-4 border-b border-[#d8d8d8] flex items-center shrink-0">
                  {isPptFile(sortedAndFilteredItems[focusedIndex].name) ? <Presentation className="w-6 h-6 mr-3 text-orange-500" /> :
                   isExcelFile(sortedAndFilteredItems[focusedIndex].name) ? <FileSpreadsheet className="w-6 h-6 mr-3 text-green-600" /> :
                   <FileText className="w-6 h-6 mr-3 text-blue-600" />}
                  <h2 className="text-lg font-bold text-slate-800 truncate">{sortedAndFilteredItems[focusedIndex].name}</h2>
                </div>
                <iframe
                  src={getOfficePreviewUrl(sortedAndFilteredItems[focusedIndex].path)}
                  className="flex-1 w-full bg-white"
                  title={sortedAndFilteredItems[focusedIndex].name}
                />
              </div>
            ) : isTextFile(sortedAndFilteredItems[focusedIndex].name) ? (
              <div className="bg-[#fafafa] flex flex-col shadow-2xl rounded-2xl w-full max-w-4xl h-[75vh] overflow-hidden">
                <div className="bg-[#ebebeb] px-6 py-4 border-b border-[#d8d8d8] flex items-center shrink-0">
                  <FileText className="w-6 h-6 mr-3" style={getFileColorStyle(sortedAndFilteredItems[focusedIndex].name)} />
                  <h2 className="text-lg font-bold text-slate-800 truncate">{sortedAndFilteredItems[focusedIndex].name}</h2>
                </div>
                <div className="flex-1 p-6 overflow-y-auto bg-white">
                  {isPreviewTextLoading ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                      <Loader2 className="w-8 h-8 animate-spin mb-3 text-[#3584e4]" />
                      <p>テキストを読み込み中...</p>
                    </div>
                  ) : (
                    <pre className="font-mono text-sm text-slate-700 whitespace-pre-wrap break-all leading-relaxed">
                      {previewText}
                    </pre>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-[#fafafa] p-16 rounded-3xl flex flex-col items-center shadow-2xl min-w-[320px]">
                <FileText className="w-40 h-40 mb-6 drop-shadow-xl" style={getFileColorStyle(sortedAndFilteredItems[focusedIndex].name)} />
                <h2 className="text-3xl font-bold text-slate-800 break-all text-center max-w-lg">{sortedAndFilteredItems[focusedIndex].name}</h2>
                <p className="text-slate-500 mt-3 font-medium">ファイル</p>
              </div>
            )}
            
            <p className="absolute -bottom-10 text-white/50 text-sm">
              ← → ↑ ↓ キーで他のファイルをプレビュー
            </p>
          </div>
        </div>
      )}
    </>
  );
};

const AppContent = () => {
  const [currentPath, setCurrentPath] = useState('\\\\server\\shared_folder');
  const [pathInput, setPathInput] = useState('\\\\server\\shared_folder');
  const [history, setHistory] = useState(['\\\\server\\shared_folder']);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [viewMode, setViewMode] = useState('icon');
  const [iconSize, setIconSize] = useState(96);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  
  const [filterText, setFilterText] = useState('');
  const [sortOption, setSortOption] = useState('name_asc'); // ★追加: ソート状態の管理
  
  const [isPathInputFocused, setIsPathInputFocused] = useState(false);

  useEffect(() => setPathInput(currentPath), [currentPath]);

  const navigateTo = (newPath) => {
    if (newPath === currentPath) return;
    setCurrentPath(newPath);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newPath);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setFilterText(''); 
  };

  const handlePathSubmit = (e) => {
    e.preventDefault();
    if (pathInput.trim()) navigateTo(pathInput.trim());
  };

  const goBack = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setCurrentPath(history[historyIndex - 1]);
      setFilterText('');
    }
  };

  const goForward = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setCurrentPath(history[historyIndex + 1]);
      setFilterText('');
    }
  };

  const goUp = () => {
    const parts = currentPath.split(/[/\\]/);
    if (parts.length > 1 && parts[parts.length - 1] !== '') {
      parts.pop();
      navigateTo(parts.join('\\') || '\\');
    }
  };

  const toggleFileSelect = useCallback((filePath) => {
    setSelectedFiles((prev) => {
      const newSet = new Set(prev);
      newSet.has(filePath) ? newSet.delete(filePath) : newSet.add(filePath);
      return newSet;
    });
  }, []);

  const addMultipleFiles = useCallback((filePaths) => {
    setSelectedFiles((prev) => {
      const newSet = new Set(prev);
      filePaths.forEach(path => newSet.add(path));
      return newSet;
    });
  }, []);

  const handleSubmit = () => {
    const filesArray = Array.from(selectedFiles);
    alert(`【処理完了】\n以下の ${filesArray.length} 件のファイルを送信します:\n\n${filesArray.slice(0, 10).join('\n')}${filesArray.length > 10 ? '\n...他多数' : ''}`);
  };

  return (
    <div className="min-h-screen bg-[#c8c8c8] p-4 md:p-8 flex items-center justify-center font-sans text-slate-800">
      <div className="w-full max-w-6xl flex flex-col lg:flex-row h-[85vh] bg-[#fafafa] rounded-2xl shadow-2xl overflow-hidden ring-1 ring-black/5 relative">
        
        <div 
          className={`absolute inset-0 bg-black/40 backdrop-blur-[2px] z-40 transition-opacity duration-300 pointer-events-none ${isPathInputFocused ? 'opacity-100' : 'opacity-0'}`} 
        />

        <div className="flex-1 flex flex-col min-w-0 border-r border-[#d8d8d8]">
          <div className="px-3 py-2 border-b border-[#d8d8d8] bg-[#ebebeb] flex items-center gap-2 relative z-50 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-1">
              <button onClick={goBack} disabled={historyIndex === 0} className="p-2 rounded-full hover:bg-[#d8d8d8] disabled:opacity-40 disabled:hover:bg-transparent transition-colors">
                <ArrowLeft className="w-4 h-4 text-slate-700" />
              </button>
              <button onClick={goForward} disabled={historyIndex >= history.length - 1} className="p-2 rounded-full hover:bg-[#d8d8d8] disabled:opacity-40 disabled:hover:bg-transparent transition-colors">
                <ArrowRight className="w-4 h-4 text-slate-700" />
              </button>
              <button onClick={goUp} className="p-2 rounded-full hover:bg-[#d8d8d8] transition-colors">
                <ArrowUp className="w-4 h-4 text-slate-700" />
              </button>
            </div>

            <form onSubmit={handlePathSubmit} className="flex-1 flex gap-2 ml-2 min-w-[200px]">
              <div className="relative w-full flex items-center">
                <Folder className="w-4 h-4 absolute left-3 text-slate-400" />
                <input
                  type="text"
                  value={pathInput}
                  onChange={(e) => setPathInput(e.target.value)}
                  onFocus={() => setIsPathInputFocused(true)} 
                  onBlur={() => setIsPathInputFocused(false)} 
                  className="w-full pl-9 pr-4 py-1.5 text-sm bg-white border border-[#cfcfcf] rounded-md shadow-sm focus:outline-none focus:border-[#3584e4] focus:ring-2 focus:ring-[#3584e4] transition-all relative z-50"
                />
              </div>
            </form>

            <div className="relative w-full sm:w-40 flex items-center mx-1 mt-2 sm:mt-0">
              <Search className="w-4 h-4 absolute left-3 text-slate-400" />
              <input
                type="text"
                placeholder="フィルター検索..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                onFocus={() => setIsPathInputFocused(true)} 
                onBlur={() => setIsPathInputFocused(false)}
                className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-[#cfcfcf] rounded-md shadow-sm focus:outline-none focus:border-[#3584e4] focus:ring-2 focus:ring-[#3584e4] transition-all relative z-50"
              />
            </div>

            {/* ★追加: ソート順切り替えプルダウン */}
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="w-auto px-2 py-1.5 text-sm bg-white border border-[#cfcfcf] rounded-md shadow-sm focus:outline-none focus:border-[#3584e4] focus:ring-2 focus:ring-[#3584e4] transition-all relative z-50 ml-1 cursor-pointer mt-2 sm:mt-0 outline-none"
            >
              <option value="name_asc">名前 (昇順)</option>
              <option value="name_desc">名前 (降順)</option>
              <option value="date_desc">更新日 (新しい順)</option>
              <option value="date_asc">更新日 (古い順)</option>
            </select>

            <div className="flex items-center bg-[#d8d8d8] rounded-md p-0.5 ml-1 mt-2 sm:mt-0 shrink-0">
              <button onClick={() => setViewMode('icon')} className={`p-1.5 rounded-sm transition-all ${viewMode === 'icon' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-sm transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 relative">
            <ExplorerView 
              currentPath={currentPath} onNavigate={navigateTo} onGoUp={goUp}
              selectedFiles={selectedFiles} toggleFileSelect={toggleFileSelect} 
              onAddMultipleFiles={addMultipleFiles} 
              viewMode={viewMode} iconSize={iconSize} setIconSize={setIconSize}
              filterText={filterText} sortOption={sortOption} // ★ソートオプションを渡す
            />
          </div>
          
          <div className="px-4 py-1.5 border-t border-[#d8d8d8] bg-[#fafafa] text-[11px] text-slate-500 flex justify-between items-center whitespace-nowrap overflow-hidden">
            <span className="truncate mr-2">{selectedFiles.size > 0 ? `${selectedFiles.size} 個のアイテムを選択中` : `${currentPath}`}</span>
            <span className="hidden lg:inline shrink-0">Space:プレビュー | Enter:開く | Ctrl+クリック:選択 | Shift+クリック:範囲一括追加</span>
          </div>
        </div>

        <div className="w-full lg:w-72 bg-[#f6f6f6] flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-[#d8d8d8] flex justify-between items-center">
            <h3 className="font-semibold text-sm text-slate-700">選択済みファイル</h3>
            {selectedFiles.size > 0 && <span className="bg-[#3584e4] text-white py-0.5 px-2 rounded-full text-xs font-bold shadow-sm">{selectedFiles.size}</span>}
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            {selectedFiles.size === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-sm text-slate-400 text-center px-4">ファイルが選択されて<br/>いません</div>
            ) : (
              <ul className="space-y-1">
                {Array.from(selectedFiles).map((filePath) => (
                  <li key={filePath} className="p-2 rounded-lg text-sm flex items-center justify-between group hover:bg-[#ebebeb] transition-colors cursor-default">
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="font-medium text-slate-700 truncate">{filePath.split(/[/\\]/).pop()}</span>
                      <span className="text-[10px] text-slate-400 truncate mt-0.5" title={filePath}>{filePath}</span>
                    </div>
                    <button onClick={() => toggleFileSelect(filePath)} className="w-6 h-6 shrink-0 flex items-center justify-center rounded-full text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-[#d8d8d8] hover:text-slate-700 transition-all">✕</button>
                  </li>
                ))}
              </ul>
            )}
            {selectedFiles.size > 0 && (
              <div className="mt-4 text-center">
                <button onClick={() => setSelectedFiles(new Set())} className="text-xs text-slate-500 hover:text-red-500 transition-colors">すべてクリア</button>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-[#d8d8d8] bg-[#f6f6f6]">
            <button onClick={handleSubmit} disabled={selectedFiles.size === 0} className="w-full py-2 bg-[#3584e4] hover:bg-[#2a6dbd] disabled:bg-[#d8d8d8] disabled:text-slate-400 text-white font-medium text-sm rounded-lg flex items-center justify-center transition-colors shadow-sm">
              処理を実行
            </button>
          </div>
        </div>

      </div>
      <style dangerouslySetInnerHTML={{__html: `.custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cfcfcf; border-radius: 10px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #b0b0b0; }`}} />
    </div>
  );
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}