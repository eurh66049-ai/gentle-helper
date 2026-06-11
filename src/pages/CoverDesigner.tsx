import React, { useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Wand2, Loader2, Download, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';

const BOOK_TYPES = ['رواية', 'قصة', 'دراسة', 'سيرة ذاتية', 'شعر', 'تاريخ', 'فلسفة', 'دين', 'علوم', 'تنمية بشرية', 'أطفال', 'فن', 'سياسة', 'اقتصاد', 'تكنولوجيا', 'عام'];

const loadCoverImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

const fitLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !current) {
      current = test;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
};

const drawCenteredArabicText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxLines: number,
  startSize: number,
  minSize: number,
  weight: number,
) => {
  if (!text.trim()) return y;

  let size = startSize;
  let lines: string[] = [];
  do {
    ctx.font = `${weight} ${size}px Arial, Tahoma, sans-serif`;
    lines = fitLines(ctx, text, maxWidth, maxLines);
    const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
    if (widest <= maxWidth && lines.length <= maxLines) break;
    size -= 4;
  } while (size >= minSize);

  const lineHeight = size * 1.28;
  const top = y - ((lines.length - 1) * lineHeight) / 2;
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.lineWidth = Math.max(3, size * 0.08);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
  ctx.shadowBlur = size * 0.16;
  ctx.shadowOffsetY = size * 0.05;

  lines.forEach((line, index) => {
    const lineY = top + index * lineHeight;
    ctx.strokeText(line, x, lineY, maxWidth);
    ctx.fillText(line, x, lineY, maxWidth);
  });
  ctx.shadowColor = 'transparent';

  return top + lines.length * lineHeight;
};

const composeArabicCover = async (baseImageUrl: string, title: string, author: string, bookType: string) => {
  const img = await loadCoverImage(baseImageUrl);
  const canvas = document.createElement('canvas');
  const width = img.naturalWidth || 1024;
  const height = img.naturalHeight || 1536;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return baseImageUrl;

  ctx.drawImage(img, 0, 0, width, height);

  const shade = ctx.createLinearGradient(0, 0, 0, height);
  shade.addColorStop(0, 'rgba(0, 0, 0, 0.50)');
  shade.addColorStop(0.28, 'rgba(0, 0, 0, 0.12)');
  shade.addColorStop(0.58, 'rgba(0, 0, 0, 0.08)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0.58)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);

  const cleanTitle = title.trim();
  const cleanAuthor = author.trim();
  const cleanType = bookType.trim();
  const maxTextWidth = width * 0.82;

  if (cleanType) {
    const categorySize = Math.max(30, width * 0.044);
    ctx.font = `700 ${categorySize}px Arial, Tahoma, sans-serif`;
    ctx.textAlign = 'center';
    ctx.direction = 'rtl';
    ctx.textBaseline = 'middle';
    const pillWidth = Math.min(width * 0.56, Math.max(width * 0.22, ctx.measureText(cleanType).width + width * 0.11));
    const pillHeight = categorySize * 1.8;
    const pillX = (width - pillWidth) / 2;
    const pillY = height * 0.07;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.44)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = Math.max(2, width * 0.003);
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillWidth, pillHeight, pillHeight / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(cleanType, width / 2, pillY + pillHeight / 2, pillWidth * 0.86);
  }

  drawCenteredArabicText(ctx, cleanTitle, width / 2, height * 0.31, maxTextWidth, 3, width * 0.108, width * 0.056, 900);

  if (cleanAuthor) {
    drawCenteredArabicText(ctx, cleanAuthor, width / 2, height * 0.88, maxTextWidth, 2, width * 0.054, width * 0.036, 700);
  }

  return canvas.toDataURL('image/png');
};

const CoverDesigner: React.FC = () => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [bookType, setBookType] = useState('رواية');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // إزالة التشكيل من النص العربي
  const stripTashkeel = (text: string) =>
    text.replace(/[\u064B-\u0652\u0670\u0640]/g, '').replace(/\s+/g, ' ').trim();

  const handleGenerate = useCallback(async () => {
    if (!title.trim()) {
      toast.error('أدخل عنوان الكتاب أولاً');
      return;
    }
    if (prompt.trim().length < 3) {
      toast.error('اكتب وصفاً للغلاف');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-cover-image', {
        body: {
          description: prompt.trim(),
          title: stripTashkeel(title),
          author: stripTashkeel(author),
          bookType,
        },
      });
      if (error) { toast.error(error.message || 'فشل التوليد'); return; }
      if (data?.error) { toast.error(data.error); return; }
      if (data?.imageUrl) {
        const finalCover = await composeArabicCover(
          data.imageUrl,
          stripTashkeel(title),
          stripTashkeel(author),
          stripTashkeel(bookType),
        );
        setImageUrl(finalCover);
        toast.success('تم إنشاء الغلاف!');
      } else {
        toast.error('لم يتم إنشاء صورة');
      }
    } catch (e: any) {
      toast.error(e?.message ?? 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [title, author, bookType, prompt]);

  const handleDownload = useCallback(() => {
    if (!imageUrl) return;
    const link = document.createElement('a');
    link.download = `${title || 'غلاف-كتاب'}.png`;
    link.href = imageUrl;
    link.click();
  }, [imageUrl, title]);

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <Helmet>
        <title>تخيّل غلاف كتابك بالذكاء الاصطناعي - منصة كتبي</title>
        <meta name="description" content="أنشئ غلاف كتاب احترافي بالذكاء الاصطناعي مع عنوان كتابك وتصنيفه تلقائياً." />
      </Helmet>
      <Navbar />
      <main className="flex-grow py-6">
        <div className="container mx-auto px-3 max-w-3xl">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary mb-3">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-bold">ميزة جديدة</span>
            </div>
            <h1 className="text-2xl font-black text-foreground mb-2">تخيّل غلاف كتابك بالذكاء الاصطناعي</h1>
            <p className="text-sm text-muted-foreground">
              اكتب وصفاً لما تتخيّله، وسيُنشئ الذكاء الاصطناعي غلافاً احترافياً يحمل عنوان كتابك وتصنيفه تلقائياً.
            </p>
          </div>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Wand2 className="h-5 w-5 text-primary" />
                إنشاء الغلاف
              </CardTitle>
              <CardDescription>املأ الحقول التالية وسيُكتب العنوان والتصنيف على الغلاف.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="mb-2 block font-semibold">عنوان الكتاب</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: ظلال الذاكرة"
                  className="text-right"
                  dir="rtl"
                />
              </div>

              <div>
                <Label className="mb-2 block font-semibold">اسم المؤلف</Label>
                <Input
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="مثال: أحمد محمد"
                  className="text-right"
                  dir="rtl"
                />
              </div>



              <div>
                <Label className="mb-2 block font-semibold">تصنيف الكتاب</Label>
                <Select value={bookType} onValueChange={setBookType}>
                  <SelectTrigger dir="rtl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BOOK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-2 block font-semibold">وصف الغلاف الذي تتخيّله</Label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="مثال: مدينة قديمة ليلاً، إضاءة قمر، ألوان داكنة مع لمسات ذهبية، أجواء غامضة..."
                  rows={5}
                  className="text-right"
                  dir="rtl"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  سيُكتب عنوان كتابك «{title || '...'}» وتصنيف «{bookType}» على الغلاف تلقائياً.
                </p>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={loading}
                className="w-full bg-gradient-to-r from-primary to-purple-600 hover:opacity-90 text-white font-bold"
                size="lg"
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 ml-2 animate-spin" /> جارٍ إنشاء الغلاف...</>
                ) : (
                  <><Wand2 className="h-4 w-4 ml-2" /> تخيّل الغلاف بالذكاء الاصطناعي</>
                )}
              </Button>

              {imageUrl && (
                <div className="pt-4 border-t">
                  <Label className="mb-3 block font-semibold">الغلاف الذي تم إنشاؤه</Label>
                  <div className="flex justify-center mb-3">
                    <img
                      src={imageUrl}
                      alt={title}
                      className="max-w-[300px] w-full rounded-lg shadow-2xl border border-border"
                    />
                  </div>
                  <Button onClick={handleDownload} variant="outline" className="w-full">
                    <Download className="h-4 w-4 ml-2" /> تحميل الغلاف
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CoverDesigner;
