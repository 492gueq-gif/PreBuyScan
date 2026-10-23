/* Applies the saved theme before first paint (no flash). */
try{const t=localStorage.getItem("pbs_theme");const pref=t?JSON.parse(t):"dark";const dark=pref==="auto"?matchMedia("(prefers-color-scheme: dark)").matches:pref!=="light";document.documentElement.dataset.theme=dark?"dark":"light";}catch(e){document.documentElement.dataset.theme="dark";}
