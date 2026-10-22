// Apply the saved theme before React loads to avoid a light/dark flash.
// (A separate file rather than an inline script so the server's Content-Security-Policy allows it.)
try {
  var theme = localStorage.getItem("theme") || "system";
  if (theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.documentElement.classList.add("dark");
  }
} catch (e) {}
