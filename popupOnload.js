function pageLoaded() {
    document.getElementById("siteSpiderGo").addEventListener("click", clickGo);
    document.getElementById("resultsPage").addEventListener("click", clickResultsPage);
    chrome.extension.getBackgroundPage().popupLoaded(document);
}

function clickGo() {
    chrome.extension.getBackgroundPage().popupGo();
    window.close();
}
  
function clickResultsPage() {
    chrome.extension.getBackgroundPage().showResultsPage();
}

window.addEventListener("load",pageLoaded);

