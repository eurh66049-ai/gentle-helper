import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY غير متوفر" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { description, title, bookType } = await req.json();
    if (!description || typeof description !== "string" || description.trim().length < 3) {
      return new Response(JSON.stringify({ error: "الرجاء كتابة وصف للغلاف" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `صمّم غلاف كتاب احترافي عالي الجودة بنسبة 2:3 (عمودي) مناسب للطباعة.
وصف الغلاف الفني: ${description}.
يجب أن يظهر على الغلاف النصوص العربية التالية بخط واضح وجميل ومقروء تماماً:
${title ? `- عنوان الكتاب بخط كبير وبارز في المنتصف أو الأعلى: «${title}».` : ""}
${bookType ? `- تصنيف الكتاب بخط أصغر في الأعلى أو الأسفل: «${bookType}».` : ""}
تعليمات إضافية: تصميم فني متقن، إضاءة احترافية، تكوين متوازن، ألوان منسجمة مع موضوع الكتاب، النصوص العربية يجب أن تكون مكتوبة بشكل صحيح ومقروء بدون أخطاء إملائية أو حروف مشوهة.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("AI gateway error:", resp.status, text);
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "تم تجاوز الحد، حاول لاحقاً" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "الرصيد غير كافٍ لتوليد الصورة" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "فشل توليد الصورة" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      console.error("No image in response", JSON.stringify(data).slice(0, 500));
      return new Response(JSON.stringify({ error: "لم يتم إنشاء صورة" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageUrl = `data:image/png;base64,${b64}`;
    return new Response(JSON.stringify({ imageUrl }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-cover-image error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? "خطأ غير متوقع" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
