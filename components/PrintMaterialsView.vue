<script setup lang="ts">
const SITE = "https://paper.yun";

interface TemplateCard {
  title: string;
  description: string;
  image: string;
  path: string;
}

const groups: { name: string; intro: string; items: TemplateCard[] }[] = [
  {
    name: "语文",
    intro: "作文、生字和书法练习常用的格子纸。",
    items: [
      {
        title: "作文纸",
        description: "标准作文格，带页头信息，适合课堂作文和默写。",
        image: "/print-materials/composition.png",
        path: "/editor/composition",
      },
      {
        title: "田字格纸",
        description: "田字格书写与描红，低年级生字练习最常用。",
        image: "/print-materials/tianzi.png",
        path: "/editor/number-tracing",
      },
      {
        title: "米字格纸",
        description: "米字格便于观察笔画位置，适合书法和汉字描红。",
        image: "/print-materials/mizi.png",
        path: "/editor/calligraphy",
      },
      {
        title: "拼音纸",
        description: "四线三格拼音书写，用来练习声母、韵母和整体认读。",
        image: "/print-materials/pinyin.png",
        path: "/editor/pinyin",
      },
      {
        title: "看拼音写词语",
        description: "上方拼音、下方写字，适合词语巩固和听写前练习。",
        image: "/print-materials/pinyin-word.png",
        path: "/editor/pinyin-word-practice",
      },
      {
        title: "笔顺字帖",
        description: "展示分步笔顺，并配田字格描写，用来学写新字。",
        image: "/print-materials/stroke-order.png",
        path: "/editor/stroke-order",
      },
      {
        title: "控笔字帖",
        description: "线条和运笔训练，适合握笔尚不稳定的学生。",
        image: "/print-materials/pen-control.png",
        path: "/editor/pen-control",
      },
    ],
  },
  {
    name: "数学",
    intro: "口算、竖式和草稿演算用纸。",
    items: [
      {
        title: "算术纸",
        description: "口算和竖式练习，数字对齐更清楚。",
        image: "/print-materials/math.png",
        path: "/editor/math",
      },
      {
        title: "方格纸",
        description: "演算、对齐和简单作图都能用。",
        image: "/print-materials/grid.png",
        path: "/editor/grid",
      },
    ],
  },
  {
    name: "英语",
    intro: "字母描红、四线三格和单词听写。",
    items: [
      {
        title: "英文四线三格纸",
        description: "按四线三格规范书写单词和句子。",
        image: "/print-materials/english-fourline.png",
        path: "/editor/english-fourline",
      },
      {
        title: "英文字母练习纸",
        description: "大小写字母描红，适合字母入门。",
        image: "/print-materials/alphabet.png",
        path: "/editor/alphabet",
      },
      {
        title: "单词听写纸",
        description: "留出听写空位，用来默写和订正单词。",
        image: "/print-materials/word-dictation.png",
        path: "/editor/word-dictation",
      },
    ],
  },
  {
    name: "日常",
    intro: "笔记和信笺一类的通用纸。",
    items: [
      {
        title: "横线纸",
        description: "日常笔记、抄写和横线练习。",
        image: "/print-materials/lined.png",
        path: "/editor/lined",
      },
      {
        title: "信纸",
        description: "可改标题的横线信笺，首尾是粗细双线。",
        image: "/print-materials/letter.png",
        path: "/editor/letter-paper",
      },
    ],
  },
];

const SOURCE = "smartedu-textbook-downloader";

function openTemplate(path = "/", entry = "banner") {
  const url = new URL(path, `${SITE}/`);
  url.searchParams.set("from", SOURCE);
  url.searchParams.set("platform", import.meta.env.BROWSER);
  url.searchParams.set("entry", entry);
  void browser.tabs.create({ url: url.toString() });
}

function tiltCta(event: PointerEvent) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const banner = event.currentTarget as HTMLElement;
  const rect = banner.getBoundingClientRect();
  const px = clamp((event.clientX - rect.left) / rect.width);
  const py = clamp((event.clientY - rect.top) / rect.height);
  banner.style.setProperty("--rx", `${15 - py * 30}deg`);
  banner.style.setProperty("--ry", `${-15 + px * 30}deg`);
  banner.style.setProperty("--tx", `${-6 + px * 12}px`);
  banner.style.setProperty("--ty", `${-4 + py * 8}px`);
}

function resetCta(event: PointerEvent) {
  const banner = event.currentTarget as HTMLElement;
  banner.style.setProperty("--rx", "0deg");
  banner.style.setProperty("--ry", "0deg");
  banner.style.setProperty("--tx", "0px");
  banner.style.setProperty("--ty", "0px");
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}
</script>

<template>
  <section class="min-h-0 min-w-0 flex-1 overflow-y-auto bg-slate-50" aria-label="打印素材">
    <header class="pf-banner" @pointermove="tiltCta" @pointerleave="resetCta">
      <div class="pf-banner-grid" aria-hidden="true"></div>
      <div class="pf-sheet pf-sheet-a" aria-hidden="true">
        <img src="/print-materials/composition.png" alt="" />
      </div>
      <div class="pf-sheet pf-sheet-b" aria-hidden="true">
        <img src="/print-materials/tianzi.png" alt="" />
      </div>
      <div class="pf-sheet pf-sheet-c" aria-hidden="true">
        <img src="/print-materials/pinyin.png" alt="" />
      </div>
      <div class="pf-banner-copy">
        <p class="pf-kicker">纸工坊 · paper.yun</p>
        <h2>在线生成专业的稿纸模板</h2>
        <p class="pf-lead">
          草稿纸、作文格、米字格、四线三格等，在线生成并可打印下载。选好下面的模板就能改格距、导出或直接打印。
        </p>
        <div class="pf-cta-stage">
          <button class="pf-cta" type="button" @click="openTemplate()">
            <span class="pf-cta-label">打开纸工坊</span>
          </button>
        </div>
      </div>
    </header>

    <div class="mx-auto max-w-6xl px-6 py-6">
      <div v-for="group in groups" :key="group.name" class="mt-8">
        <div class="mb-3">
          <h3 class="text-base font-semibold text-slate-900">{{ group.name }}</h3>
          <p class="mt-1 text-sm text-slate-500">{{ group.intro }}</p>
        </div>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
          <article
            v-for="item in group.items"
            :key="item.path"
            class="pf-card flex cursor-pointer flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            role="link"
            tabindex="0"
            @click="openTemplate(item.path, 'template')"
            @keydown.enter.prevent="openTemplate(item.path, 'template')"
            @keydown.space.prevent="openTemplate(item.path, 'template')"
          >
            <div class="aspect-[3/4] bg-slate-100">
              <img class="h-full w-full object-contain" :src="item.image" :alt="item.title" />
            </div>
            <div class="flex flex-1 flex-col gap-2 p-3">
              <h4 class="text-base font-medium text-slate-900">{{ item.title }}</h4>
              <p class="text-sm leading-relaxed text-slate-500">{{ item.description }}</p>
              <span
                class="mt-auto w-full rounded-lg bg-violet-600 px-2 py-1.5 text-center text-sm font-medium text-white"
              >
                去制作
              </span>
            </div>
          </article>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.pf-banner {
  position: relative;
  overflow: hidden;
  margin: 0;
  border-radius: 0;
  padding: 72px 28px 64px;
  text-align: center;
  color: #fff;
  background: linear-gradient(120deg, #5b4dff, #7c5cff 42%, #3d8bfd 78%, #6d5efc);
  background-size: 220% 220%;
  animation: pf-gradient 14s ease-in-out infinite;
}

.pf-banner-grid {
  position: absolute;
  inset: -20%;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.16) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.16) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: radial-gradient(circle at center, #000 30%, transparent 72%);
  animation: pf-drift 18s linear infinite;
}

.pf-sheet {
  position: absolute;
  width: 108px;
  height: 146px;
  overflow: hidden;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 12px 28px rgba(30, 27, 75, 0.18);
}

.pf-sheet img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top;
}

.pf-sheet-a {
  top: 18%;
  left: 8%;
  animation: pf-float 7s ease-in-out infinite;
}

.pf-sheet-b {
  right: 10%;
  bottom: 16%;
  width: 78px;
  height: 108px;
  transform: rotate(8deg);
  animation: pf-float 8.5s ease-in-out infinite reverse;
}

.pf-sheet-c {
  top: 22%;
  right: 18%;
  width: 64px;
  height: 86px;
  opacity: 0.55;
  animation: pf-float 6.5s ease-in-out 0.6s infinite;
}

.pf-banner-copy {
  position: relative;
  z-index: 1;
  max-width: 640px;
  margin: 0 auto;
  animation: pf-rise 0.7s ease both;
}

.pf-kicker {
  margin: 0;
  font-size: 13px;
  letter-spacing: 0.18em;
  color: rgba(255, 255, 255, 0.82);
}

.pf-banner h2 {
  margin: 14px 0 0;
  font-size: 40px;
  font-weight: 700;
  letter-spacing: 1px;
  line-height: 1.25;
}

.pf-lead {
  margin: 14px auto 0;
  max-width: 520px;
  font-size: 16px;
  font-weight: 300;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.9);
}

.pf-card {
  position: relative;
  z-index: 0;
  transform: scale(1);
  transform-origin: center center;
  transition: transform 0.28s cubic-bezier(0.215, 0.61, 0.355, 1);
}

.pf-card:hover {
  z-index: 1;
  transform: scale(1.04);
}

.pf-cta-stage {
  display: inline-block;
  margin-top: 28px;
  perspective: 650px;
}

.pf-cta {
  border: 0;
  border-radius: 999px;
  padding: 16px 40px;
  font-size: 18px;
  font-weight: 600;
  color: #4c1d95;
  background: #fff;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(30, 27, 75, 0.18);
  transform: rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg));
  transform-style: preserve-3d;
  transition: transform 0.5s cubic-bezier(0.215, 0.61, 0.355, 1);
  will-change: transform;
}

.pf-cta-label {
  display: inline-block;
  transform: translate3d(var(--tx, 0px), var(--ty, 0px), 12px);
  transition: transform 0.5s cubic-bezier(0.215, 0.61, 0.355, 1);
  will-change: transform;
}

@keyframes pf-gradient {
  0%,
  100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

@keyframes pf-drift {
  from {
    transform: translate3d(0, 0, 0);
  }
  to {
    transform: translate3d(28px, 28px, 0);
  }
}

@keyframes pf-float {
  0%,
  100% {
    transform: translateY(0) rotate(-6deg);
  }
  50% {
    transform: translateY(-12px) rotate(4deg);
  }
}

@keyframes pf-rise {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 720px) {
  .pf-banner {
    margin: 0;
    padding: 56px 20px 48px;
  }

  .pf-banner h2 {
    font-size: 30px;
  }

  .pf-sheet-c {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pf-banner,
  .pf-banner-grid,
  .pf-sheet,
  .pf-banner-copy {
    animation: none;
  }

  .pf-cta,
  .pf-cta-label,
  .pf-card {
    transition: none;
  }

  .pf-card:hover {
    transform: none;
  }
}
</style>

