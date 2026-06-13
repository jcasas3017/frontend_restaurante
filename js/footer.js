document.addEventListener("DOMContentLoaded", function () {

    const footer = document.getElementById("footer-global");

    if (footer) {
        footer.innerHTML = APP_CONFIG.FOOTER_HTML;
    }

});