export default defineAppConfig({
  ui: {
    // Індиго як акцент, сланцевий (slate) як нейтральний: холодніші й контрастніші відтінки
    colors: { primary: 'indigo', neutral: 'slate' },
    // Без тіней: плаваючі елементи відокремлюються лише рамкою (ring)
    modal: { slots: { content: 'shadow-none' } },
    popover: { slots: { content: 'shadow-none' } },
    select: { slots: { content: 'shadow-none' } },
  },
});
