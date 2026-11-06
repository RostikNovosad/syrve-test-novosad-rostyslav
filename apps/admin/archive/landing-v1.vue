<!-- АРХІВ: перший варіант лендінгу (serif, похила стрічка). Поза pages/, тому не маршрутизується. Щоб повернути — скопіюйте в pages/index.vue -->
<script setup lang="ts">
/**
 * Лендінг сервісу «Лояльно».
 *
 * Арт-напрямок: «еспресо та мідь» — темний теплий фон, кремовий текст, один акцент (мідь).
 * Фокус героя: картка гостя + чат Telegram, зібрані як інтерфейс (не ілюстрація).
 * Рух: GSAP (інтро героя, поява заголовків по словах, ScrollTrigger), Lenis — єдиний smooth-scroll.
 * Three.js свідомо не використовується: просторової задачі, яку він вирішував би, немає.
 * Зображень і логотипів сторонніх брендів немає, тому питань походження медіа немає; Syrve і Telegram — лише назва в тексті.
 */
definePageMeta({ layout: false });
useHead({
  title: 'Лояльно — бонуси гостей у Telegram для кафе й ресторанів',
  meta: [
    {
      name: 'description',
      content:
        'Програма лояльності для кафе й ресторанів: гість реєструється в Telegram, отримує картку з QR-кодом, а баланс і нарахування живуть у Syrve Loyalty.',
    },
    { name: 'theme-color', content: '#14100d' },
  ],
  link: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..600;1,9..144,400..500&family=Manrope:wght@400;500;600;700&display=swap',
    },
  ],
});

const steps = [
  {
    n: '01',
    title: 'Гість пише боту',
    text: 'Ділиться контактом і вводить імʼя. Сервіс шукає його в Syrve за телефоном — дублів не буде.',
  },
  {
    n: '02',
    title: 'Картка з’являється одразу',
    text: 'У Syrve створюється гість, підключається програма лояльності, випускається картка. У боті — номер, QR і баланс.',
  },
  {
    n: '03',
    title: 'Адміністратор нараховує',
    text: 'Знаходить гостя за телефоном і нараховує або списує бонуси з причиною. Більше за баланс списати не вийде.',
  },
  {
    n: '04',
    title: 'Гість отримує повідомлення',
    text: '«Нараховано 50 бонусів, баланс 230» — одне повідомлення на одну операцію, навіть якщо її зробили в кабінеті Syrve.',
  },
];

const features = [
  {
    icon: 'i-solar-card-2-linear',
    title: 'Картка та QR у Telegram',
    text: 'Номер картки, QR-код для каси й актуальний баланс — у чаті з ботом і в Mini App, без окремого застосунку.',
  },
  {
    icon: 'i-solar-bell-bing-linear',
    title: 'Сповіщення без дублів',
    text: 'Сервіс сам стежить за транзакціями в Syrve. Кожна операція — рівно одне повідомлення гостю.',
  },
  {
    icon: 'i-solar-users-group-rounded-linear',
    title: 'Список гостей',
    text: 'Пошук за телефоном, фільтри за Telegram, карткою та датою реєстрації, сортування.',
  },
  {
    icon: 'i-solar-history-linear',
    title: 'Історія і журнал',
    text: 'Усі операції гостя та журнал дій адміністраторів: хто, коли, скільки і чому.',
  },
  {
    icon: 'i-solar-chart-2-linear',
    title: 'Статистика',
    text: 'Нові реєстрації, нараховані та списані бонуси за період — для власника закладу.',
  },
  {
    icon: 'i-solar-shield-user-linear',
    title: 'Ролі та доступи',
    text: 'Власник і менеджер: різні права, вхід за логіном і паролем, захист від перебору.',
  },
];

const faq = [
  {
    q: 'Де зберігаються бонуси гостей?',
    a: 'У Syrve Loyalty. Наш сервіс не тримає копію балансу: щоразу показує актуальне значення з Syrve, тож розбіжностей між касою, кабінетом і ботом бути не може.',
  },
  {
    q: 'Що, якщо гість уже є в Syrve?',
    a: 'Ми шукаємо гостя за номером телефону у форматі +380… перед створенням. Існуючому гостю просто підключається Telegram.',
  },
  {
    q: 'Чи потрібен домен чи HTTPS, щоб почати?',
    a: 'Для бота — ні: він працює через long polling. HTTPS потрібен лише для Telegram Mini App.',
  },
  {
    q: 'Можна спробувати без доступу до Syrve?',
    a: 'Так. У демо-режимі працює імітатор Syrve з тими самими операціями, включно з імітацією нарахування для перевірки сповіщень.',
  },
  {
    q: 'Яка мова інтерфейсу?',
    a: 'Лише українська — і для гостей, і для адміністраторів.',
  },
];

const root = ref<HTMLElement | null>(null);
const menuOpen = ref(false);
const navScrolled = ref(false);
const openFaq = ref<number | null>(0);

// Інтерактивна картка: нахил за вказівником (лише для точних вказівників, додатково до статичного стану)
const tilt = reactive({ x: 0, y: 0 });
const cardStyle = computed(() => ({
  transform: `perspective(900px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)`,
}));
let lastMove = 0;
function onPointer(e: PointerEvent) {
  if (e.pointerType !== 'mouse') return;
  const now = performance.now();
  if (now - lastMove < 16) return;
  lastMove = now;
  tilt.x = (e.clientX / window.innerWidth - 0.5) * 10;
  tilt.y = -(e.clientY / window.innerHeight - 0.5) * 8;
}
function resetTilt() {
  tilt.x = 0;
  tilt.y = 0;
}

// QR-«макет» для демонстраційної картки: детермінований візерунок (не справжній QR)
const qrCells = Array.from({ length: 169 }, (_, i) => {
  const x = i % 13;
  const y = Math.floor(i / 13);
  const finder = (x < 4 && y < 4) || (x > 8 && y < 4) || (x < 4 && y > 8);
  if (finder) return x % 3 === 0 || y % 3 === 0 || (x > 8 ? (x - 9) % 3 === 0 : false) || (y > 8 ? (y - 9) % 3 === 0 : false);
  return ((x * 7 + y * 13 + x * y) % 5) < 2;
});

let cleanup: (() => void) | null = null;

onMounted(async () => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const onScroll = () => (navScrolled.value = window.scrollY > 24);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Розбиття заголовків на слова: доступна назва лишається цілою, візуальні слова приховані від скрінрідерів
  const headings = Array.from(root.value!.querySelectorAll<HTMLElement>('[data-split]'));
  const wordSets: HTMLElement[][] = headings.map((h) => {
    h.setAttribute('aria-label', h.textContent!.replace(/\s+/g, ' ').trim());
    const words: HTMLElement[] = [];
    const walk = (node: Node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const parts = child.textContent!.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          parts.forEach((p) => {
            if (!p) return;
            if (/^\s+$/.test(p)) return frag.appendChild(document.createTextNode(' '));
            const mask = document.createElement('span');
            mask.className = 'w-mask';
            mask.setAttribute('aria-hidden', 'true');
            const inner = document.createElement('span');
            inner.className = 'w';
            inner.textContent = p;
            mask.appendChild(inner);
            frag.appendChild(mask);
            words.push(inner);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE) walk(child);
      });
    };
    walk(h);
    return words;
  });

  if (reduce) {
    // Без руху: фінальні стани одразу, жодного Lenis і ScrollTrigger
    cleanup = () => window.removeEventListener('scroll', onScroll);
    return;
  }

  const [{ gsap }, { ScrollTrigger }, { default: Lenis }] = await Promise.all([
    import('gsap'),
    import('gsap/ScrollTrigger'),
    import('lenis'),
  ]);
  gsap.registerPlugin(ScrollTrigger);

  // Єдиний smooth-scroll: Lenis, керований тікером GSAP
  const lenis = new Lenis({ lerp: 0.1 });
  lenis.on('scroll', ScrollTrigger.update);
  const tick = (t: number) => lenis.raf(t * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  // Якорі працюють через Lenis
  const anchorHandler = (e: Event) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a || a.getAttribute('href') === '#') return;
    const el = root.value!.querySelector(a.getAttribute('href')!);
    if (!el) return;
    e.preventDefault();
    lenis.scrollTo(el as HTMLElement, { offset: -72 });
  };
  root.value!.addEventListener('click', anchorHandler);

  const ctx = gsap.context(() => {
    // Інтро героя
    const heroWords = wordSets[0] ?? [];
    gsap.set(heroWords, { yPercent: 110 });
    gsap.set('.hero-fade', { autoAlpha: 0, y: 24 });
    gsap.set('.hero-card', { autoAlpha: 0, y: 60, rotate: 4 });
    gsap.set('.hero-phone', { autoAlpha: 0, y: 80 });
    gsap
      .timeline({ defaults: { ease: 'power3.out' } })
      .to(heroWords, { yPercent: 0, duration: 1, stagger: 0.07 }, 0.1)
      .to('.hero-fade', { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.1 }, 0.6)
      .to('.hero-phone', { autoAlpha: 1, y: 0, duration: 1.1 }, 0.4)
      .to('.hero-card', { autoAlpha: 1, y: 0, rotate: 0, duration: 1.1 }, 0.7)
      .from('.chat-msg', { autoAlpha: 0, y: 14, duration: 0.5, stagger: 0.35 }, 1.2);

    // Паралакс картки та телефону при скролі героя
    gsap.to('.hero-card-wrap', {
      yPercent: -14,
      ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });
    gsap.to('.hero-phone', {
      yPercent: 8,
      ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });

    // Заголовки секцій — по словах
    wordSets.slice(1).forEach((words, i) => {
      const h = headings[i + 1]!;
      gsap.set(words, { yPercent: 110 });
      gsap.to(words, {
        yPercent: 0,
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.06,
        scrollTrigger: { trigger: h, start: 'top 85%', once: true },
      });
    });

    // Підтримуючі блоки
    gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
      gsap.from(el, {
        autoAlpha: 0,
        y: 36,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      });
    });

    // Кроки: лінія прогресу заповнюється під час скролу
    gsap.fromTo(
      '.steps-line-fill',
      { scaleY: 0 },
      {
        scaleY: 1,
        ease: 'none',
        transformOrigin: 'top',
        scrollTrigger: { trigger: '.steps', start: 'top 60%', end: 'bottom 70%', scrub: true },
      },
    );
  }, root.value!);

  // Вимірювання оновлюємо, коли шрифти завантажились
  document.fonts?.ready.then(() => ScrollTrigger.refresh());

  cleanup = () => {
    window.removeEventListener('scroll', onScroll);
    root.value?.removeEventListener('click', anchorHandler);
    ctx.revert();
    gsap.ticker.remove(tick);
    lenis.destroy();
  };
});

onBeforeUnmount(() => cleanup?.());
</script>

<template>
  <div ref="root" class="lp" @pointermove="onPointer" @pointerleave="resetTilt" @blur.capture="resetTilt">
    <a href="#main" class="skip">Перейти до змісту</a>

    <!-- Навігація -->
    <header class="nav" :class="{ scrolled: navScrolled || menuOpen }">
      <div class="wrap nav-in">
        <a href="#top" class="brand" aria-label="Лояльно — на початок">
          <span class="brand-mark" aria-hidden="true"><Icon name="i-solar-cup-hot-bold" /></span>
          Лояльно
        </a>
        <nav class="nav-links" :class="{ open: menuOpen }" aria-label="Основна навігація">
          <a href="#how" @click="menuOpen = false">Як це працює</a>
          <a href="#features" @click="menuOpen = false">Можливості</a>
          <a href="#syrve" @click="menuOpen = false">Syrve</a>
          <a href="#faq" @click="menuOpen = false">Питання</a>
          <NuxtLink to="/admin/login" class="btn btn-sm btn-ghost nav-cta-mobile">Вхід для персоналу</NuxtLink>
        </nav>
        <NuxtLink to="/admin/login" class="btn btn-sm btn-ghost nav-cta">Вхід для персоналу</NuxtLink>
        <button
          class="burger"
          :aria-expanded="menuOpen"
          aria-controls="menu"
          :aria-label="menuOpen ? 'Закрити меню' : 'Відкрити меню'"
          @click="menuOpen = !menuOpen"
        >
          <span /><span />
        </button>
      </div>
    </header>

    <main id="main">
      <!-- Герой -->
      <section id="top" class="hero">
        <div class="wrap hero-grid">
          <div class="hero-copy">
            <p class="eyebrow hero-fade">Лояльність для кафе й ресторанів</p>
            <h1 data-split class="display">
              Бонуси гостей — у&nbsp;Telegram. <em>Облік</em> — у&nbsp;Syrve.
            </h1>
            <p class="lead hero-fade">
              Гість реєструється в боті за хвилину й отримує картку з QR-кодом. Баланс та історія лишаються в Syrve Loyalty,
              а ви керуєте нарахуваннями з простої панелі.
            </p>
            <div class="cta-row hero-fade">
              <NuxtLink to="/admin/login" class="btn btn-primary">
                Спробувати демо-панель
                <Icon name="i-solar-arrow-right-linear" />
              </NuxtLink>
              <a href="#how" class="btn btn-link">Як це працює</a>
            </div>
            <ul class="hero-points hero-fade" aria-label="Ключові переваги">
              <li><Icon name="i-solar-check-circle-linear" /> Без окремого застосунку</li>
              <li><Icon name="i-solar-check-circle-linear" /> Без копії балансу</li>
              <li><Icon name="i-solar-check-circle-linear" /> Працює й без доступу до Syrve</li>
            </ul>
          </div>

          <div class="hero-visual" aria-hidden="true">
            <div class="hero-phone">
              <div class="phone-top"><span class="avatar-dot"><Icon name="i-solar-cup-hot-bold" /></span> Лояльно · бот</div>
              <div class="chat">
                <div class="chat-msg in">Привіт! Поділіться контактом, щоб отримати картку.</div>
                <div class="chat-msg out">📱 +380 •• ••• 42 17</div>
                <div class="chat-msg in">Готово! Ваша картка активна. Баланс: <b>0</b> бонусів.</div>
                <div class="chat-msg in note"><Icon name="i-solar-bell-bing-bold" /> Нараховано <b>50</b> бонусів. Баланс: <b>230</b></div>
              </div>
            </div>
            <div class="hero-card-wrap">
              <div class="hero-card loyalty-card" :style="cardStyle">
                <div class="lc-head">
                  <span>Картка гостя</span>
                  <Icon name="i-solar-cup-hot-bold" />
                </div>
                <div class="lc-balance">
                  <small>Баланс</small>
                  <strong>230 <i>бонусів</i></strong>
                </div>
                <div class="lc-foot">
                  <div>
                    <small>Номер картки</small>
                    <span>0000 0000 0001</span>
                  </div>
                  <div class="qr">
                    <span v-for="(on, i) in qrCells" :key="i" :class="{ on }" />
                  </div>
                </div>
              </div>
              <p class="demo-note">Демонстраційні дані</p>
            </div>
          </div>
        </div>

        <div class="marquee" aria-hidden="true">
          <div class="marquee-track">
            <span v-for="n in 2" :key="n">
              Реєстрація в Telegram <i>✦</i> Картка та QR <i>✦</i> Нарахування й списання <i>✦</i> Сповіщення <i>✦</i> Історія операцій
              <i>✦</i> Список гостей <i>✦</i> Mini App <i>✦</i>
            </span>
          </div>
        </div>
      </section>

      <!-- Як це працює -->
      <section id="how" class="section">
        <div class="wrap">
          <p class="eyebrow" data-reveal>Як це працює</p>
          <h2 data-split class="h2">Від першого повідомлення до <em>бонусів на картці</em> — чотири кроки</h2>
          <ol class="steps">
            <span class="steps-line" aria-hidden="true"><span class="steps-line-fill" /></span>
            <li v-for="s in steps" :key="s.n" class="step" data-reveal>
              <span class="step-n" aria-hidden="true">{{ s.n }}</span>
              <div>
                <h3>{{ s.title }}</h3>
                <p>{{ s.text }}</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <!-- Можливості -->
      <section id="features" class="section section-alt">
        <div class="wrap">
          <p class="eyebrow" data-reveal>Можливості</p>
          <h2 data-split class="h2">Все, що потрібно закладу, — <em>і нічого зайвого</em></h2>
          <div class="features">
            <article v-for="f in features" :key="f.title" class="feature" data-reveal>
              <span class="feature-ic" aria-hidden="true"><Icon :name="f.icon" /></span>
              <h3>{{ f.title }}</h3>
              <p>{{ f.text }}</p>
            </article>
          </div>
        </div>
      </section>

      <!-- Syrve -->
      <section id="syrve" class="section">
        <div class="wrap syrve">
          <div>
            <p class="eyebrow" data-reveal>Інтеграція</p>
            <h2 data-split class="h2">Джерело істини — <em>Syrve</em>, а не наша база</h2>
            <p class="lead" data-reveal>
              Сервіс — тонка обгортка: Telegram для гостя, панель для персоналу. Гості, картки, програми та гаманці живуть у
              Syrve Loyalty, тому каса, кабінет і бот завжди показують однаковий баланс.
            </p>
            <ul class="checks" data-reveal>
              <li><Icon name="i-solar-check-circle-bold" /> Токен Syrve оновлюється автоматично</li>
              <li><Icon name="i-solar-check-circle-bold" /> Пошук гостя за телефоном — без дублів</li>
              <li><Icon name="i-solar-check-circle-bold" /> Секрети лише в налаштуваннях, не в коді</li>
              <li><Icon name="i-solar-check-circle-bold" /> Запуск однією командою через Docker Compose</li>
            </ul>
          </div>
          <div class="flow" data-reveal role="img" aria-label="Схема: Telegram і панель адміністратора працюють через сервіс Лояльно з Syrve Loyalty">
            <div class="flow-node"><Icon name="i-solar-chat-round-dots-linear" /><b>Telegram</b><small>бот і Mini App</small></div>
            <div class="flow-link" />
            <div class="flow-node core"><Icon name="i-solar-cup-hot-bold" /><b>Лояльно</b><small>реєстрація · журнал · сповіщення</small></div>
            <div class="flow-link" />
            <div class="flow-node"><Icon name="i-solar-database-linear" /><b>Syrve Loyalty</b><small>гості · картки · баланс</small></div>
            <div class="flow-node admin"><Icon name="i-solar-monitor-linear" /><b>Панель</b><small>для персоналу</small></div>
          </div>
        </div>
      </section>

      <!-- Ролі -->
      <section class="section section-alt">
        <div class="wrap">
          <p class="eyebrow" data-reveal>Для кого</p>
          <h2 data-split class="h2">Два інтерфейси — <em>одна програма лояльності</em></h2>
          <div class="roles">
            <article class="role" data-reveal>
              <h3><Icon name="i-solar-user-circle-linear" /> Гість</h3>
              <ul>
                <li>Реєстрація в Telegram за хвилину</li>
                <li>Картка, QR-код і баланс завжди під рукою</li>
                <li>Повідомлення про кожну зміну балансу</li>
                <li>Mini App з історією операцій</li>
              </ul>
            </article>
            <article class="role" data-reveal>
              <h3><Icon name="i-solar-shield-user-linear" /> Адміністратор закладу</h3>
              <ul>
                <li>Вхід за логіном і паролем</li>
                <li>Пошук гостя за телефоном, список та фільтри</li>
                <li>Нарахування й списання з обовʼязковою причиною</li>
                <li>Журнал дій і статистика за період</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <!-- FAQ -->
      <section id="faq" class="section">
        <div class="wrap faq-wrap">
          <div>
            <p class="eyebrow" data-reveal>Питання</p>
            <h2 data-split class="h2">Коротко <em>про головне</em></h2>
          </div>
          <div class="faq" data-reveal>
            <div v-for="(item, i) in faq" :key="item.q" class="faq-item" :class="{ open: openFaq === i }">
              <h3>
                <button :id="`faq-b-${i}`" :aria-expanded="openFaq === i" :aria-controls="`faq-p-${i}`" @click="openFaq = openFaq === i ? null : i">
                  {{ item.q }}
                  <Icon name="i-solar-add-circle-linear" class="faq-ic" aria-hidden="true" />
                </button>
              </h3>
              <div :id="`faq-p-${i}`" class="faq-panel" role="region" :aria-labelledby="`faq-b-${i}`">
                <p>{{ item.a }}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Фінальний CTA -->
      <section id="cta" class="section cta-final">
        <div class="wrap">
          <h2 data-split class="h2 big">Подивіться, як це працює <em>на вашому закладі</em></h2>
          <p class="lead" data-reveal>Увійдіть у демо-панель, знайдіть гостя за телефоном і нарахуйте перші бонуси.</p>
          <div class="cta-row center" data-reveal>
            <NuxtLink to="/admin/login" class="btn btn-primary">
              Відкрити панель
              <Icon name="i-solar-arrow-right-linear" />
            </NuxtLink>
          </div>
        </div>
      </section>
    </main>

    <footer class="footer">
      <div class="wrap foot-in">
        <span class="brand"><span class="brand-mark" aria-hidden="true"><Icon name="i-solar-cup-hot-bold" /></span> Лояльно</span>
        <nav aria-label="Футер">
          <a href="#how">Як це працює</a>
          <a href="#features">Можливості</a>
          <a href="#faq">Питання</a>
          <NuxtLink to="/admin/login">Вхід для персоналу</NuxtLink>
        </nav>
        <small>Прототип сервісу лояльності поверх Syrve Cloud API. Syrve і Telegram — назви їхніх власників.</small>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.lp {
  --ink: #14100d;
  --ink-2: #1c1713;
  --line: rgba(244, 235, 221, 0.12);
  --cream: #f4ebdd;
  --muted: rgba(244, 235, 221, 0.66);
  --copper: #e9824a;
  --copper-2: #f3a574;
  --serif: 'Fraunces', Georgia, 'Times New Roman', serif;
  --sans: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  background: var(--ink);
  color: var(--cream);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.6;
  min-height: 100vh;
  overflow-x: clip;
}
.lp * { box-sizing: border-box; }
.lp :is(h1, h2, h3, p, ul, ol) { margin: 0; }
.lp a { color: inherit; text-decoration: none; }
.wrap { width: min(1180px, 100% - 32px); margin-inline: auto; }

/* Видимий фокус */
.lp :is(a, button):focus-visible { outline: 2px solid var(--copper-2); outline-offset: 3px; border-radius: 6px; }
.skip { position: absolute; left: 16px; top: -60px; z-index: 100; background: var(--cream); color: var(--ink); padding: 8px 14px; border-radius: 8px; }
.skip:focus { top: 12px; }

/* Навігація */
.nav { position: fixed; inset: 0 0 auto 0; z-index: 50; transition: background 0.3s, border-color 0.3s; border-bottom: 1px solid transparent; }
.nav.scrolled { background: rgba(20, 16, 13, 0.88); backdrop-filter: blur(10px); border-color: var(--line); }
.nav-in { display: flex; align-items: center; gap: 24px; height: 68px; }
.brand { display: inline-flex; align-items: center; gap: 10px; font-family: var(--serif); font-size: 22px; font-weight: 500; letter-spacing: -0.01em; }
.brand-mark { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: var(--copper); color: var(--ink); font-size: 18px; }
.nav-links { display: flex; gap: 28px; margin-left: auto; font-size: 14px; font-weight: 500; color: var(--muted); }
.nav-links a:hover { color: var(--cream); }
.nav-links .nav-cta-mobile { display: none; }
.burger { display: none; width: 44px; height: 44px; border: 1px solid var(--line); border-radius: 12px; background: transparent; cursor: pointer; position: relative; margin-left: auto; }
.burger span { position: absolute; left: 13px; right: 13px; height: 2px; background: var(--cream); transition: transform 0.25s; }
.burger span:first-child { top: 17px; }
.burger span:last-child { top: 25px; }
.burger[aria-expanded='true'] span:first-child { transform: translateY(4px) rotate(45deg); }
.burger[aria-expanded='true'] span:last-child { transform: translateY(-4px) rotate(-45deg); }

/* Кнопки */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 52px; padding: 0 26px; border-radius: 999px; font-weight: 700; font-size: 15px; border: 1px solid transparent; cursor: pointer; transition: transform 0.2s, background 0.2s, border-color 0.2s, color 0.2s; }
.btn-primary { background: var(--copper); color: var(--ink); }
.btn-primary:hover { background: var(--copper-2); transform: translateY(-2px); }
.btn-primary:active { transform: translateY(0); }
.btn-ghost { border-color: var(--line); color: var(--cream); }
.btn-ghost:hover { border-color: var(--copper); color: var(--copper-2); }
.btn-link { color: var(--muted); padding: 0 8px; }
.btn-link:hover { color: var(--cream); }
.btn-sm { min-height: 40px; padding: 0 18px; font-size: 14px; }

/* Типографіка */
.eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--copper-2); margin-bottom: 20px; }
.display, .h2 { font-family: var(--serif); font-weight: 400; letter-spacing: -0.025em; line-height: 1.04; font-variation-settings: 'opsz' 144; }
.display { font-size: clamp(42px, 6.4vw, 88px); }
.h2 { font-size: clamp(32px, 4.4vw, 58px); max-width: 18ch; margin-bottom: 56px; }
.h2.big { font-size: clamp(38px, 6vw, 84px); max-width: 16ch; margin-inline: auto; text-align: center; }
.display em, .h2 em { font-style: italic; color: var(--copper-2); }
.lead { font-size: clamp(17px, 1.5vw, 20px); color: var(--muted); max-width: 52ch; }
:deep(.w-mask) { display: inline-block; overflow: hidden; vertical-align: top; padding-bottom: 0.12em; margin-bottom: -0.12em; }
:deep(.w) { display: inline-block; will-change: transform; }

/* Герой */
.hero { position: relative; padding: 132px 0 0; overflow: hidden; }
.hero::before { content: ''; position: absolute; width: 780px; height: 780px; right: -220px; top: -200px; border-radius: 50%; border: 1px solid var(--line); box-shadow: 0 0 0 90px rgba(244, 235, 221, 0.015), 0 0 0 180px rgba(244, 235, 221, 0.012); pointer-events: none; }
.hero-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 48px; align-items: center; min-height: calc(100svh - 190px); padding-bottom: 72px; position: relative; }
.hero-copy .display { margin-bottom: 28px; }
.hero-copy .lead { margin-bottom: 36px; }
.cta-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.cta-row.center { justify-content: center; margin-top: 36px; }
.hero-points { display: flex; flex-wrap: wrap; gap: 10px 24px; list-style: none; padding: 0; margin-top: 32px; font-size: 14px; color: var(--muted); }
.hero-points li { display: inline-flex; align-items: center; gap: 8px; }
.hero-points :deep(svg) { color: var(--copper); }

.hero-visual { position: relative; height: 560px; }
.hero-phone { position: absolute; right: 0; top: 0; width: min(300px, 62%); border-radius: 32px; background: var(--ink-2); border: 1px solid var(--line); padding: 14px; }
.phone-top { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 600; padding: 4px 4px 14px; border-bottom: 1px solid var(--line); }
.avatar-dot { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--copper); color: var(--ink); }
.chat { display: flex; flex-direction: column; gap: 10px; padding-top: 14px; font-size: 13px; line-height: 1.45; }
.chat-msg { max-width: 88%; padding: 10px 13px; border-radius: 16px; }
.chat-msg.in { background: rgba(244, 235, 221, 0.08); border-bottom-left-radius: 4px; }
.chat-msg.out { align-self: flex-end; background: var(--copper); color: var(--ink); border-bottom-right-radius: 4px; font-weight: 600; }
.chat-msg.note { background: rgba(233, 130, 74, 0.16); border: 1px solid rgba(233, 130, 74, 0.35); }
.chat-msg.note :deep(svg) { color: var(--copper-2); vertical-align: -2px; }
.hero-card-wrap { position: absolute; left: 0; bottom: 20px; width: min(380px, 80%); }
.loyalty-card { aspect-ratio: 1.6; border-radius: 24px; padding: 22px; display: flex; flex-direction: column; justify-content: space-between; background: linear-gradient(140deg, #f3a574 0%, #e9824a 55%, #c9622c 100%); color: var(--ink); transition: transform 0.25s ease-out; will-change: transform; box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.6); }
.lc-head { display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.lc-balance small, .lc-foot small { display: block; font-size: 11px; font-weight: 600; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.08em; }
.lc-balance strong { font-family: var(--serif); font-size: 46px; font-weight: 500; line-height: 1; letter-spacing: -0.02em; }
.lc-balance i { font-size: 16px; font-style: normal; font-family: var(--sans); font-weight: 600; }
.lc-foot { display: flex; align-items: flex-end; justify-content: space-between; font-weight: 700; font-size: 14px; }
.qr { display: grid; grid-template-columns: repeat(13, 1fr); width: 64px; height: 64px; padding: 5px; background: var(--cream); border-radius: 8px; gap: 0; }
.qr span.on { background: var(--ink); }
.demo-note { margin-top: 12px; font-size: 12px; color: var(--muted); }

.marquee { border-block: 1px solid var(--line); overflow: hidden; padding: 16px 0; }
.marquee-track { display: flex; width: max-content; animation: marquee 38s linear infinite; font-family: var(--serif); font-size: 22px; font-style: italic; color: var(--muted); white-space: nowrap; }
.marquee-track span { padding-right: 24px; }
.marquee-track i { font-style: normal; color: var(--copper); margin: 0 14px; font-size: 14px; }
@keyframes marquee { to { transform: translateX(-50%); } }

/* Секції */
.section { padding: clamp(72px, 11vw, 140px) 0; }
.section-alt { background: var(--ink-2); border-block: 1px solid var(--line); }

.steps { position: relative; list-style: none; padding: 0 0 0 0; display: grid; gap: 8px; max-width: 760px; }
.steps-line { position: absolute; left: 27px; top: 14px; bottom: 14px; width: 2px; background: var(--line); }
.steps-line-fill { position: absolute; inset: 0; background: var(--copper); transform-origin: top; }
.step { display: grid; grid-template-columns: 56px 1fr; gap: 28px; padding: 22px 0; position: relative; }
.step-n { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 50%; background: var(--ink); border: 1px solid var(--line); font-family: var(--serif); font-size: 18px; color: var(--copper-2); position: relative; z-index: 1; }
.step h3 { font-family: var(--serif); font-weight: 500; font-size: 26px; letter-spacing: -0.01em; margin-bottom: 8px; }
.step p { color: var(--muted); max-width: 52ch; }

.features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 20px; overflow: hidden; }
.feature { background: var(--ink-2); padding: 32px 28px 36px; transition: background 0.25s; }
.feature:hover { background: #231d18; }
.feature-ic { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 14px; border: 1px solid var(--line); color: var(--copper-2); font-size: 24px; margin-bottom: 24px; }
.feature h3 { font-family: var(--serif); font-weight: 500; font-size: 22px; margin-bottom: 8px; }
.feature p { color: var(--muted); font-size: 15px; }

.syrve { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center; }
.syrve .h2 { margin-bottom: 28px; }
.checks { list-style: none; padding: 0; margin-top: 32px; display: grid; gap: 12px; }
.checks li { display: flex; align-items: center; gap: 12px; }
.checks :deep(svg) { color: var(--copper); font-size: 20px; flex: none; }
.flow { display: grid; grid-template-columns: 1fr 28px 1fr; grid-template-areas: 'a l1 b' '. . l2' 'd . c'; align-items: center; gap: 0; }
.flow-node { display: flex; flex-direction: column; gap: 2px; padding: 20px; border: 1px solid var(--line); border-radius: 18px; background: var(--ink-2); font-size: 14px; }
.flow-node :deep(svg) { font-size: 26px; color: var(--copper-2); margin-bottom: 8px; }
.flow-node b { font-size: 17px; font-family: var(--serif); font-weight: 500; }
.flow-node small { color: var(--muted); }
.flow-node.core { border-color: var(--copper); background: rgba(233, 130, 74, 0.08); }
.flow-link { height: 2px; background: repeating-linear-gradient(90deg, var(--copper) 0 6px, transparent 6px 12px); }
.flow > :nth-child(1) { grid-area: a; }
.flow > :nth-child(2) { grid-area: l1; }
.flow > :nth-child(3) { grid-area: b; }
.flow > :nth-child(4) { grid-area: l2; width: 2px; height: 28px; justify-self: center; background: repeating-linear-gradient(180deg, var(--copper) 0 6px, transparent 6px 12px); }
.flow > :nth-child(5) { grid-area: c; }
.flow-node.admin { grid-area: d; }
.flow { grid-template-areas: 'a l1 b' '. . l2' 'd . c'; }

.roles { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.role { border: 1px solid var(--line); border-radius: 24px; padding: clamp(24px, 3vw, 40px); background: var(--ink); }
.role h3 { display: flex; align-items: center; gap: 12px; font-family: var(--serif); font-weight: 500; font-size: 28px; margin-bottom: 24px; }
.role h3 :deep(svg) { color: var(--copper); }
.role ul { list-style: none; padding: 0; display: grid; gap: 14px; }
.role li { padding-left: 22px; position: relative; color: var(--muted); }
.role li::before { content: ''; position: absolute; left: 0; top: 0.7em; width: 8px; height: 2px; background: var(--copper); }

.faq-wrap { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 64px; }
.faq-wrap .h2 { margin-bottom: 0; }
.faq-item { border-bottom: 1px solid var(--line); }
.faq-item:first-child { border-top: 1px solid var(--line); }
.faq-item h3 { font-size: inherit; }
.faq-item button { all: unset; box-sizing: border-box; display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 16px; padding: 24px 0; cursor: pointer; font-family: var(--serif); font-size: 21px; }
.faq-item button:focus-visible { outline: 2px solid var(--copper-2); outline-offset: 2px; }
.faq-ic { flex: none; font-size: 26px; color: var(--copper); transition: transform 0.3s; }
.faq-item.open .faq-ic { transform: rotate(45deg); }
.faq-panel { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.35s ease; }
.faq-panel p { overflow: hidden; color: var(--muted); max-width: 60ch; }
.faq-item.open .faq-panel { grid-template-rows: 1fr; }
.faq-item.open .faq-panel p { padding-bottom: 24px; }

.cta-final { text-align: center; position: relative; overflow: hidden; }
.cta-final::before { content: ''; position: absolute; left: 50%; top: 50%; width: 900px; height: 900px; transform: translate(-50%, -50%); border-radius: 50%; border: 1px solid var(--line); box-shadow: 0 0 0 100px rgba(244, 235, 221, 0.012), 0 0 0 200px rgba(244, 235, 221, 0.01); pointer-events: none; }
.cta-final .wrap { position: relative; }
.cta-final .lead { margin: 28px auto 0; }

.footer { border-top: 1px solid var(--line); padding: 40px 0; color: var(--muted); font-size: 14px; }
.foot-in { display: grid; grid-template-columns: auto 1fr; gap: 20px 40px; align-items: center; }
.foot-in nav { display: flex; flex-wrap: wrap; gap: 8px 24px; justify-content: flex-end; }
.foot-in nav a:hover { color: var(--cream); }
.foot-in small { grid-column: 1 / -1; }
.footer .brand { color: var(--cream); }

/* Адаптив */
@media (max-width: 960px) {
  .hero-grid { grid-template-columns: 1fr; min-height: 0; }
  .hero-visual { height: 520px; max-width: 520px; margin-inline: auto; width: 100%; }
  .features { grid-template-columns: 1fr 1fr; }
  .syrve, .faq-wrap, .roles { grid-template-columns: 1fr; gap: 40px; }
  .roles { gap: 20px; }
  .nav-cta { display: none; }
  .burger { display: block; }
  .nav-links { position: fixed; inset: 68px 0 auto 0; flex-direction: column; gap: 0; margin: 0; background: var(--ink); border-bottom: 1px solid var(--line); padding: 8px 16px 20px; transform: translateY(-120%); visibility: hidden; transition: transform 0.3s, visibility 0.3s; font-size: 18px; }
  .nav-links.open { transform: none; visibility: visible; }
  .nav-links a:not(.btn) { padding: 14px 0; border-bottom: 1px solid var(--line); }
  .nav-links .nav-cta-mobile { display: inline-flex; margin-top: 16px; }
}
@media (max-width: 600px) {
  .features { grid-template-columns: 1fr; }
  .hero { padding-top: 104px; }
  .hero-visual { height: 480px; }
  .hero-phone { width: 66%; }
  .hero-card-wrap { width: 86%; bottom: 0; }
  .step { grid-template-columns: 48px 1fr; gap: 18px; }
  .step-n { width: 48px; height: 48px; }
  .steps-line { left: 23px; }
  .foot-in { grid-template-columns: 1fr; }
  .foot-in nav { justify-content: flex-start; }
  .flow { grid-template-columns: 1fr; grid-template-areas: none; gap: 12px; }
  .flow > * { grid-area: auto !important; }
  .flow-link, .flow > :nth-child(4) { display: none; }
}

/* Зменшений рух: без марки та переходів */
@media (prefers-reduced-motion: reduce) {
  .marquee-track { animation: none; }
  .loyalty-card, .faq-panel, .faq-ic, .btn { transition: none; }
}
</style>
