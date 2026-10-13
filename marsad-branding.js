
/* الهوية البصرية لمنصة مرصد */
(() => {
  'use strict';

  const BRAND = {
    name: 'مَرْصَد',
    tagline: 'النوازل العقدية',
    logo: 'marsad-logo.png',
    colors: {
      navy: '#08192F',
      navyLight: '#122844',
      gold: '#D5AB5E',
      cream: '#F7F3E9',
      ink: '#17263D',
      line: '#E4D9C5',
      muted: '#6B7484'
    }
  };

  const { navy, navyLight, gold, cream, ink, line, muted } =
    BRAND.colors;

  const css = `
    :root {
      --g: ${gold};
      --dark: ${navy};
      --bg: ${cream};
      --line: ${line};
      --muted: ${muted};
      --marsad-navy: ${navy};
      --marsad-gold: ${gold};
    }

    body {
      background: ${cream} !important;
      color: ${ink} !important;
      font-family: Tahoma, Arial, sans-serif !important;
    }

    h1, h2, h3, h4 {
      color: ${navy};
    }

    .marsad-site-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 0 18px;
      margin-bottom: 16px;
      border-bottom: 1px solid ${line};
    }

    .marsad-brand-logo {
      width: 76px;
      height: 76px;
      flex: 0 0 76px;
      object-fit: contain;
      border-radius: 12px;
      border: 1px solid ${gold};
      background: ${navy};
    }

    .marsad-brand-name {
      display: block;
      color: ${navy};
      font-size: 25px;
      font-weight: 800;
    }

    .marsad-brand-tagline {
      display: block;
      color: #977039;
      font-size: 13px;
      margin-top: 3px;
    }

    body > main {
      max-width: 1040px !important;
      margin: 22px auto !important;
      padding: 24px !important;
      background: rgba(255,255,255,.88);
      border: 1px solid ${line};
      border-radius: 20px;
      box-shadow: 0 18px 50px rgba(8,25,47,.07);
    }

    section, .panel, .card {
      border-color: ${line} !important;
      border-radius: 16px !important;
    }

    section, .panel {
      background: #fff !important;
    }

    input, textarea, select {
      border-color: ${line} !important;
      border-radius: 10px !important;
      color: ${ink};
    }

    button {
      border-radius: 10px !important;
      transition: background .15s ease;
    }

    .course-card, .item-card {
      border-color: ${line} !important;
      border-radius: 13px !important;
      background: #fff !important;
    }

    .shell aside {
      background: ${navy} !important;
    }

    .shell .brand {
      border-bottom-color: #D5AB5E55 !important;
    }

    .shell .brand .marsad-site-brand {
      padding: 0;
      margin: 0;
      border: 0;
      gap: 9px;
    }

    .shell .brand .marsad-brand-logo {
      width: 48px;
      height: 48px;
      flex-basis: 48px;
    }

    .shell .brand .marsad-brand-name {
      color: #fff;
      font-size: 19px;
    }

    .shell .brand .marsad-brand-tagline {
      color: #E3D2AE;
      font-size: 11px;
    }

    .shell .brand small {
      color: #E3D2AE !important;
    }

    .nav button.active,
    .nav button:hover {
      background: #D5AB5E2E !important;
      color: #FFE6B4 !important;
    }

    .hero {
      background: linear-gradient(120deg, ${navy}, ${navyLight}) !important;
      border: 1px solid #D5AB5E66;
    }

    .tag {
      background: #F4E9D3 !important;
      color: #76521D !important;
    }

    .btn {
      background: ${navy} !important;
      border-color: ${navy} !important;
      color: #fff !important;
    }

    .btn.secondary {
      background: #F2EADB !important;
      color: ${navy} !important;
      border-color: ${line} !important;
    }

    th {
      background: #F4EFE4 !important;
      color: ${navy} !important;
    }

    .notice {
      border-color: ${line} !important;
      background: #FBF8F1 !important;
    }

    @media (max-width: 640px) {
      body > main {
        margin: 10px auto !important;
        padding: 14px !important;
      }

      .marsad-brand-logo {
        width: 60px;
        height: 60px;
        flex-basis: 60px;
      }

      .marsad-brand-name {
        font-size: 22px;
      }
    }
  `;

  function makeBrand(extraLabel = '') {
    const wrapper = document.createElement('div');
    wrapper.className = 'marsad-site-brand';

    const img = document.createElement('img');
    img.className = 'marsad-brand-logo';
    img.src = BRAND.logo;
    img.alt = `شعار ${BRAND.name}`;

    const copy = document.createElement('div');
    const name = document.createElement('strong');
    name.className = 'marsad-brand-name';
    name.textContent = BRAND.name;

    const tagline = document.createElement('span');
    tagline.className = 'marsad-brand-tagline';
    tagline.textContent = BRAND.tagline;

    copy.append(name, tagline);

    if (extraLabel) {
      const extra = document.createElement('small');
      extra.className = 'marsad-brand-tagline';
      extra.textContent = extraLabel;
      copy.append(extra);
    }

    wrapper.append(img, copy);
    return wrapper;
  }

  function applyBranding() {
    if (document.getElementById('marsad-branding-style')) return;

    const style = document.createElement('style');
    style.id = 'marsad-branding-style';
    style.textContent = css;
    document.head.appendChild(style);

    const sidebarBrand = document.querySelector('.shell aside .brand');

    if (sidebarBrand && !sidebarBrand.querySelector('.marsad-site-brand')) {
      sidebarBrand.textContent = '';
      sidebarBrand.appendChild(makeBrand('لوحة الإدارة'));
    }

    const loginCard = document.querySelector('.login .card');

    if (loginCard && !loginCard.querySelector('.marsad-site-brand')) {
      loginCard.insertBefore(makeBrand(), loginCard.firstChild);
    }

    const loginTitle = document.querySelector('#loginScreen .card h1');
    if (loginTitle) loginTitle.textContent = BRAND.name;

    const studentMain = document.querySelector('body > main');

    if (
      studentMain &&
      !document.querySelector('.shell') &&
      !studentMain.querySelector('.marsad-site-brand')
    ) {
      studentMain.insertBefore(makeBrand(), studentMain.firstChild);
    }

    if (!document.title.includes(BRAND.name)) {
      document.title = `${BRAND.name} | ${document.title}`;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyBranding, { once: true });
  } else {
    applyBranding();
  }
})();
