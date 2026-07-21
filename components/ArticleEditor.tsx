import React, { useEffect, useRef, useState } from 'react';
import { dbService } from '../services/dbService';

interface Props { value: string; onChange: (value: string) => void; }

const ArticleEditor: React.FC<Props> = ({ value, onChange }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) editorRef.current.innerHTML = value;
  }, [value]);

  const run = (command: string, argument?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, argument);
    onChange(editorRef.current?.innerHTML || '');
  };

  const addImages = async (files: FileList | File[]) => {
    const images = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (!images.length) return;
    setUploading(true);
    try {
      for (const file of images) {
        const url = await dbService.uploadBlogImage(file);
        run('insertHTML', `<figure><img src="${url}" alt="" /><figcaption>Image caption</figcaption></figure><p><br></p>`);
      }
    } finally { setUploading(false); setDragging(false); }
  };

  const tools = [
    ['Bold', 'bold', 'fa-bold'], ['Italic', 'italic', 'fa-italic'],
    ['Subtitle', 'formatBlock', 'fa-heading', 'h2'], ['Heading 3', 'formatBlock', 'fa-heading', 'h3'],
    ['Bullets', 'insertUnorderedList', 'fa-list-ul'], ['Numbered list', 'insertOrderedList', 'fa-list-ol'],
    ['Quote', 'formatBlock', 'fa-quote-left', 'blockquote'], ['Link', 'createLink', 'fa-link'],
  ] as const;

  return (
    <div className={`rounded-2xl border bg-white overflow-hidden transition ${dragging ? 'border-blue-500 ring-4 ring-blue-500/10' : 'border-slate-200'}`}>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1.5 p-3 bg-slate-50 border-b border-slate-200">
        {tools.map(([label, command, icon, arg]) => (
          <button key={label} type="button" title={label} onClick={() => {
            const value = command === 'createLink' ? window.prompt('Paste a link URL') || undefined : arg;
            if (command !== 'createLink' || value) run(command, value);
          }} className="h-9 min-w-9 px-3 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200">
            <i className={`fas ${icon}`}></i><span className="sr-only">{label}</span>
          </button>
        ))}
        <span className="h-6 w-px bg-slate-200 mx-1" />
        <button type="button" onClick={() => fileRef.current?.click()} className="h-9 px-3 rounded-lg bg-blue-600 text-white text-xs font-bold">
          <i className="fas fa-image mr-2" />{uploading ? 'Uploading…' : 'Add image'}
        </button>
        <button type="button" onClick={() => run('removeFormat')} className="h-9 px-3 rounded-lg text-xs font-bold text-slate-500">Clear style</button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && void addImages(e.target.files)} />
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); void addImages(e.dataTransfer.files); }}
        data-placeholder="Write the article here. Add subtitles, lists, bold text, links and images…"
        className="article-editor min-h-[460px] p-7 outline-none text-slate-800 leading-8"
      />
      <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
        Drag and drop images anywhere into the article. Maximum 8 MB per image.
      </div>
    </div>
  );
};

export default ArticleEditor;
