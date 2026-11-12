module.exports = {
  title: 'Оренда',
  shortDescription: "База даних оголошення про оренду нерухомості, транспортних засобів та обладнання",
  description: "Оренда — це публічна онлайн-база даних з відкритим кодом про орендовані активи. Переглядайте квартири, будинки, транспортні засоби, обладнання тощо. Фільтруйте за ціною, типом, місцем розташування та характеристиками!",
  keywords: ["оренда", "квартира", "будинок", "земля", "кімната", "транспорт", "техніка", "база даних", "машина", "обладнання", "здається"],
  paginate: 4,
  logo: '/assets/svg/logo/main.svg',
  // Submit endpoint for the add-property form. Site-specific, so it lives with
  // the site data rather than in the form config (src/_data/add-property.yml).
  addPropertyEndpoint: 'https://add-property-worker.sparkling-union-9e0a.workers.dev',
  // Submit endpoint for the demo form. Site-specific stub; the config stays
  // site-agnostic and never carries a worker URL.
  demoEndpoint: '/api/demo',
  // Submit endpoint for the notify form (property page modal).
  notifyEndpoint: 'https://notify-worker.sparkling-union-9e0a.workers.dev'
};