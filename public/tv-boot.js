// A TV screen (#/…?tv=1 or ?dash=1, e.g. after its automatic reload) is always dark: paint it dark before the app
// boots so a light theme never flashes white. App removes this once the dark TV overlay is on screen.
if (/[?&](tv|dash)=1(&|$)/.test(location.hash)) {
  var tvBoot = document.createElement('style');
  tvBoot.id = 'tv-boot-bg';
  tvBoot.textContent = 'html,body{background:#07090c!important}';
  document.head.appendChild(tvBoot);
}
