/* Stare, zapisane adresy portali nie wymagają już dodatkowego kliknięcia. */
(function () {
  var name = new URLSearchParams(location.search).get('projekt') || '';
  location.replace('/podroz/?projekt=' + encodeURIComponent(name));
})();
