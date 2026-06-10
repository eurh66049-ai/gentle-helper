import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import Navbar from '@/components/layout/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Loader2,
  ArrowRight,
  Save,
  CheckCircle2,
  XCircle,
  Image as ImageIcon,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { ChapterContent } from '@/lib/chapterContent';

interface Chapter {
  id: string;
  story_id: string;
  chapter_number: number;
  title: string;
  content: string;
  is_published: boolean;
  word_count: number;
}

const countWords = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const MAX_IMAGE_MB = 5;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const ChapterEditorPage: React.FC = () => {
  const { storyId, chapterId } = useParams<{ storyId: string; chapterId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const cursorRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!chapterId || !user) return;
    (async () => {
      const { data, error } = await supabase
        .from('story_chapters')
        .select(
          'id,story_id,chapter_number,title,content,is_published,word_count, user_stories!inner(author_id)',
        )
        .eq('id', chapterId)
        .maybeSingle();
      if (error || !data) {
        toast.error('تعذر تحميل الفصل');
        navigate(`/write/${storyId}`);
        return;
      }
      // @ts-ignore
      if (data.user_stories?.author_id !== user.id) {
        toast.error('غير مصرح');
        navigate('/write');
        return;
      }
      const { user_stories: _u, ...rest } = data as any;
      setChapter(rest as Chapter);
      setLoading(false);
    })();
  }, [chapterId, user, navigate, storyId]);

  const save = async (next: Chapter, silent = false) => {
    setSaving(true);
    const wc = countWords(next.content);
    const { error } = await supabase
      .from('story_chapters')
      .update({
        title: next.title.trim() || `الفصل ${next.chapter_number}`,
        content: next.content,
        word_count: wc,
      })
      .eq('id', next.id);
    setSaving(false);
    if (error) {
      if (!silent) toast.error('فشل الحفظ');
      return false;
    }
    dirtyRef.current = false;
    setSavedAt(new Date());
    if (!silent) toast.success('تم الحفظ');
    return true;
  };

  // Auto-save debounced
  useEffect(() => {
    if (!chapter || !dirtyRef.current) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      if (chapter) save(chapter, true);
    }, 2000);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [chapter?.content, chapter?.title]);

  const update = (patch: Partial<Chapter>) => {
    if (!chapter) return;
    dirtyRef.current = true;
    setChapter({ ...chapter, ...patch });
  };

  const togglePublish = async () => {
    if (!chapter) return;
    await save(chapter, true);
    const newState = !chapter.is_published;
    const { error } = await supabase
      .from('story_chapters')
      .update({
        is_published: newState,
        published_at: newState ? new Date().toISOString() : null,
      })
      .eq('id', chapter.id);
    if (error) {
      toast.error('فشل تحديث حالة النشر');
      return;
    }
    setChapter({ ...chapter, is_published: newState });
    toast.success(newState ? 'تم نشر الفصل' : 'تم إلغاء النشر');
  };

  const rememberCursor = () => {
    const el = textareaRef.current;
    if (el) cursorRef.current = el.selectionStart ?? el.value.length;
  };

  const insertAtCursor = (snippet: string) => {
    if (!chapter) return;
    const pos = Math.min(cursorRef.current, chapter.content.length);
    const before = chapter.content.slice(0, pos);
    const after = chapter.content.slice(pos);
    // Ensure the marker sits on its own line.
    const prefix = before.length === 0 || before.endsWith('\n') ? '' : '\n';
    const suffix = after.startsWith('\n') || after.length === 0 ? '' : '\n';
    const insertion = `${prefix}${snippet}${suffix}`;
    const newContent = before + insertion + after;
    update({ content: newContent });
    const newPos = pos + insertion.length;
    cursorRef.current = newPos;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        try {
          el.setSelectionRange(newPos, newPos);
        } catch {}
      }
    });
  };

  const onPickImage = () => {
    rememberCursor();
    fileInputRef.current?.click();
  };

  const handleImageUpload = async (file: File) => {
    if (!user || !chapter) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('نوع الصورة غير مدعوم (JPG/PNG/WEBP/GIF)');
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      toast.error(`الحد الأقصى لحجم الصورة ${MAX_IMAGE_MB} ميجابايت`);
      return;
    }
    setUploadingImg(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${user.id}/chapters/${chapter.id}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('stories')
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('stories').getPublicUrl(path);
      const url = pub.publicUrl;
      insertAtCursor(`![](${url})`);
      toast.success('تمت إضافة الصورة');
    } catch (e: any) {
      console.error(e);
      toast.error('فشل رفع الصورة');
    } finally {
      setUploadingImg(false);
    }
  };

  if (loading || !chapter) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-grow flex justify-center items-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const wc = countWords(chapter.content);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-grow container mx-auto px-3 py-4 max-w-3xl">
        <div className="flex items-center justify-between mb-3">
          <Link
            to={`/write/${storyId}`}
            className="text-sm text-primary flex items-center gap-1"
          >
            <ArrowRight className="h-4 w-4" /> العودة للقصة
          </Link>
          <div className="text-[11px] text-muted-foreground flex items-center gap-2">
            {saving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> جارٍ الحفظ...
              </>
            ) : savedAt ? (
              <>تم الحفظ {savedAt.toLocaleTimeString('ar')}</>
            ) : null}
          </div>
        </div>

        <div className="mb-2 text-xs text-muted-foreground">
          الفصل #{chapter.chapter_number} • {wc} كلمة
        </div>

        <Input
          value={chapter.title}
          onChange={(e) => update({ title: e.target.value })}
          maxLength={200}
          className="text-lg font-black mb-3"
          placeholder="عنوان الفصل"
        />

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onPickImage}
            disabled={uploadingImg}
            className="gap-1"
          >
            {uploadingImg ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImageIcon className="h-4 w-4" />
            )}
            <span>إدراج صورة</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPreview((v) => !v)}
            className="gap-1"
          >
            <Eye className="h-4 w-4" />
            <span>{showPreview ? 'إخفاء المعاينة' : 'معاينة'}</span>
          </Button>
          <span className="text-[11px] text-muted-foreground">
            اضغط داخل النص حيث تريد ثم اضغط «إدراج صورة»
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImageUpload(f);
              if (e.target) e.target.value = '';
            }}
          />
        </div>

        <Textarea
          ref={textareaRef}
          value={chapter.content}
          onChange={(e) => {
            cursorRef.current = e.target.selectionStart ?? 0;
            update({ content: e.target.value });
          }}
          onClick={rememberCursor}
          onKeyUp={rememberCursor}
          onSelect={rememberCursor}
          onBlur={rememberCursor}
          placeholder="ابدأ كتابة فصلك هنا... استخدم «إدراج صورة» لإضافة صور بين الفقرات."
          className="min-h-[60vh] text-base leading-loose font-[Tajawal,sans-serif]"
          dir="rtl"
        />

        {showPreview && (
          <div className="mt-4 p-4 border rounded-lg bg-muted/30">
            <div className="text-xs text-muted-foreground mb-2">معاينة كما يظهر للقارئ</div>
            <div dir="rtl">
              <ChapterContent content={chapter.content} />
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-3 sticky bottom-2 bg-background/95 backdrop-blur p-2 rounded-lg border">
          <Button
            onClick={() => save(chapter)}
            disabled={saving}
            variant="outline"
            className="flex-1"
          >
            <Save className="h-4 w-4 ml-1" /> حفظ
          </Button>
          <Button
            onClick={togglePublish}
            className="flex-1"
            variant={chapter.is_published ? 'secondary' : 'default'}
          >
            {chapter.is_published ? (
              <>
                <XCircle className="h-4 w-4 ml-1" /> إلغاء النشر
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 ml-1" /> نشر الفصل
              </>
            )}
          </Button>
        </div>
      </main>
    </div>
  );
};

export default ChapterEditorPage;
