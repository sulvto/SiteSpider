/**
 * Copyright 2011 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * How long to wait before one gives up on a connection.
 * @type {number}
 */
var HTTP_REQUEST_TIMEOUT = 30 * 1000;
var HEAD_REQUEST_TIMEOUT = 10 * 1000;
/**
 * Title of the results page (while spidering).
 * @type {string}
 */
var RESULTS_TITLE = 'Site Spider Results';
/**
 * List of mime types that we will load for further spidering.
 * text/plain is due to some web servers sending html using the wrong mime type.
 * @type {Array.<string>}
 */
var SPIDER_MIME = ['text/html', 'text/plain', 'text/xml'];

var popupDoc = null;
var resultsTab = null;
var jobs = [];
var downloading = false;
// {'jobId':[0, 1, 10, 50, 100, 90, 80, 70, 60, 50, ... ]}
var chart = {};
const CHART_STORE_NAME = "Site_Spider_Chart_Store_Name";
const CHART_ID_NAME = "jobId";
const JOB_STORE_NAME = "Site_Spider_Job_Store_Name";

const PAGESTODO_ID_NAME = "jobId";
const PAGESTODO_STORE_NAME = "Site_Spider_pagesTodo_Store_Name";

const PAGESDONE_ID_NAME = "jobId";
const PAGESDONE_STORE_NAME = "Site_Spider_pagesDone_Store_Name";

var chartStore = DB(CHART_STORE_NAME, CHART_ID_NAME);
var jobStore = DB(JOB_STORE_NAME);

var pagesTodoStore = DB(PAGESTODO_STORE_NAME, PAGESTODO_ID_NAME);
var pagesDoneStore = DB(PAGESDONE_STORE_NAME, PAGESDONE_ID_NAME);

var TASK_LIMIT = 6;
var TASK_TIMEOUT = 2 * 60 * 1000;

var RETRY_MAX = 5;

function storeJobs() {
    console.log("store jobs...");

    for (var i = 0; i < jobs.length; i++) {
        var storeObj = Object.assign(new Job(), jobs[i]);
        storeObj.tasks = [];
        jobStore.save(storeObj, function (error) {
            if (error) {
                console.error(error)
            }
        });
    }
}

function removeStoreChart(id) {
    console.log("remove store chart...");
    chartStore.remove(id, function (error) {
        if (error) {
            console.error(error)
        }
    });
}

function storeChart() {
    console.log("store chart...");

    for (var jobId in chart) {
        chartStore.save({jobId: jobId, data: chart[jobId]}, function (error) {
            if (error) {
                console.error(error)
            }
        });
    }
}

function restoreJobs() {
    console.log("restore jobs...");
    jobStore.readAll(function (error, data) {
        if (!error) {
            data.forEach(function (item) {
                var job = Object.assign(new Job(), item);
                jobs.push(job);
                restorePagesTodo(item.id);
                restorePagesDone(item.id);
                for (var url in job.spidering) {
                    job.pagesTodo[url] = true;
                    delete job.spidering[url];
                }
            });
        } else {
            console.error(error);
        }
    });
}

function restorePagesTodo(jobId) {
    console.log("restore pagesTodo...");
    pagesTodoStore.read(jobId, function (error, result) {
        if (!error) {
            var job = getJob(jobId);
            for (var i in result.data) {
                job.pagesTodo[i] = result.data[i];
            }
        } else {
            console.error(error);
        }
    });
}

function restorePagesDone(jobId) {
    console.log("restore pagesDone...");
    pagesDoneStore.read(jobId, function (error, result) {
        if (!error) {
            var job = getJob(jobId);
            for (var i in result.data) {
                job.pagesDone[i] = result.data[i];
            }
        } else {
            console.error(error);
        }
    });
}

function restoreChart() {
    console.log("restore chart...");
    chartStore.readAll(function (error, data) {
        if (!error) {
            data.forEach(function (item) {
                chart[item.jobId] = item.data;
            });
        } else {
            console.error(error);
        }
    });
}

// Init

(function () {
    restoreChart();
    restoreJobs();
})();


/**
 * Save a reference to the popup's document object,
 * then initialize the popup's fields.
 * Called by the popup as soon as it is loaded.
 * @param {Document} doc The popup's document object.
 */
function popupLoaded(doc) {
    popupDoc = doc;
    chrome.tabs.getSelected(null, setDefaultUrl_);
}

/**
 * Initialize the popup's fields.
 * Callback from chrome.tabs.getSelected.
 * @param {Tab} The currently selected tab.
 * @private
 */
function setDefaultUrl_(tab) {
    // Use the currently selected tab's URL as a start point.
    var url;
    if (tab && tab.url && tab.url.match(/^\s*https?:\/\//i)) {
        url = tab.url;
    } else {
        url = 'http://www.example.com/';
    }
    popupDoc.getElementById('start').value = url;

    // Compute a default regex which will limit the spider
    // to the current directory.
    var allowedText = url;
    // Trim off any hash.
    allowedText = trimAfter(allowedText, '#');
    // Trim off any arguments.
    allowedText = trimAfter(allowedText, '?');
    // Trim off any filename, leaving the path.
    var div = allowedText.lastIndexOf('/');
    if (div > 'https://'.length) {
        allowedText = allowedText.substring(0, div + 1);
    }
    // Sanitize regex characters in URL.
    allowedText =
        allowedText.replace(/([\^\$\.\*\+\?\=\!\:\|\\\(\)\[\]\{\}])/g,
            '\\$1');
    allowedText = '^' + allowedText;
    popupDoc.getElementById('regex').value = allowedText;

}

/**
 * Truncate a string to remove the specified character and anything after.
 * e.g. trimAfter('ab-cd-ef', '-') -> 'ab'
 * @param {string} string String to trim.
 * @param {string} sep Character to split on.
 * @return {string} String with character and any trailing substring removed.
 */
function trimAfter(string, sep) {
    var div = string.indexOf(sep);
    if (div != -1) {
        return string.substring(0, div);
    }
    return string;
}

function Job() {
    this.id = new Date().getTime();
    this.startPage = '';
    this.allowedText = '';
    this.allowedRegex = null;
    this.allowPlusOne = false;
    this.allowArguments = false;
    this.checkInline = false;
    this.checkScripts = false;
    this.verboseInline = false;
    this.verboseScripts = false;
    this.httpRequestWatchDogPid = 0;
    this.newTabWatchDogPid = 0;
    this.started = false;
    this.paused = false;
    this.skippedpagesDon = {};
    this.status = 'Initializing...';
    this.tasks = [];
    this.pagesTodo = {};
    this.pagesDone = {};
    this.pagesError = {};
    this.spidering = {};
}

Job.prototype.findTask = function (taskId) {
    for (var i = 0; i < this.tasks.length; i++) {
        if (this.tasks[i].id === taskId) {
            return this.tasks[i];
        }
    }
    return null;
};


Job.prototype.removeTask = function (taskId) {
    for (var i = 0; i < this.tasks.length; i++) {
        if (this.tasks[i].id === taskId) {
            this.tasks.splice(i, 1);
            break;
        }
    }
};

Job.prototype.removeAllTask = function () {

    for (var i = 0; i < this.tasks.length; i++) {
        closeSpiderTab(this.tasks[i].id);
    }

    this.tasks = [];
};


Job.prototype.storeJob = function () {

    console.log("store job[" + this.id + "]...");

    var storeObj = Object.assign(new Job(), this);
    storeObj.pagesTodo = {};
    storeObj.pagesDone = {};
    storeObj.tasks = [];
    jobStore.save(storeObj, function (error) {
        if (error) {
            console.error(error)
        }
    });

    this.storePagesTodo();
    this.storePagesDone();
};

Job.prototype.storePagesTodo = function () {
    console.log("store pagesTodo[" + this.id + "]...");

    pagesTodoStore.save({jobId: this.id, data: this.pagesTodo}, function (error) {
        if (error) {
            console.error(error)
        }
    });
};

Job.prototype.storePagesDone = function () {
    console.log("store pagesDone[" + this.id + "]...");

    pagesDoneStore.save({jobId: this.id, data: this.pagesDone}, function (error) {
        if (error) {
            console.error(error)
        }
    });
};


Job.prototype.removeStoreJob = function () {
    console.log("remove store job...");

    jobStore.remove(this.id, function (error) {
        if (error) {
            console.error(error);
        }
    });

    pagesDoneStore.remove(this.id, function (error) {
        if (error) {
            console.error(error);
        }
    });

    pagesTodoStore.remove(this.id, function (error) {
        if (error) {
            console.error(error);
        }
    });

};

function pauseJob(id) {
    var job = getJob(id);

    if (job && job.started) {
        job.paused = true;
        job.started = false;
        job.storeJob();
    }
}

function removeJob(id) {
    for (var i = 0; i < jobs.length; i++) {
        if (jobs[i].id === id) {
            jobs[i].removeAllTask(jobs[i]);
            jobs.splice(i, 1);

            jobs[i].removeStoreJob();
            removeStoreChart(id);
            return;
        }
    }
}


function Task(jobId) {
    return {id: genTaskId(), createDate: new Date(), jobId: jobId}
}


function getJob(id) {
    for (var i = 0; i < jobs.length; i++) {
        if (jobs[i].id === id) {
            return jobs[i];
        }
    }

    return null;
}

function getTask(taskId) {
    for (var i = 0; i < jobs.length; i++) {
        var task = jobs[i].findTask(taskId);
        if (task) {
            return task;
        }
    }

    return null;
}

function taskCount() {
    var result = 0;
    for (var i = 0; i < jobs.length; i++) {
        result += jobs[i].tasks.length;
    }

    return result;
}

function checkTasks() {
    jobs.forEach(function (job) {
        job.tasks.forEach(function (task) {
            if (new Date().getTime() - task.createDate.getTime() > TASK_TIMEOUT) {
                console.log('task[' + task.id + '] timeout');
                closeSpiderTab(task.id);
            }
        })
    })
}


function genTaskId() {
    if (!window.genTaskIds) {
        window.genTaskIds = 0;
    }

    window.genTaskIds++;

    return window.genTaskIds + "_" + new Date().getTime();
}


/**
 * Start a spidering session.
 * Called by the popup's Go button.
 */
function popupGo() {

    // Attempt to parse the allowed URL regex.
    var allowedText = popupDoc.getElementById('regex').value;

    var job;
    for (var i = 0; i < jobs.length; i++) {
        if (jobs[i].allowedText == allowedText) {
            job = jobs[i];
            break;
        }
    }

    if (!job) {
        job = new Job();
        jobs.push(job);
    }

    // Rename title of any previous results so we don't edit them.
    var resultsWindows = chrome.extension.getViews({
        type: 'tab'
    });
    for (var x = 0; x < resultsWindows.length; x++) {
        var doc = resultsWindows[x].document;
        if (doc.title == RESULTS_TITLE) {
            doc.title = RESULTS_TITLE + ' - Closed';
        }
    }

    job.allowedText = allowedText;

    try {
        job.allowedRegex = new RegExp(job.allowedText);
    } catch (e) {
        alert('Restrict regex error:\n' + e);
        popupStop();
        return;
    }

    // Save settings for checkboxes.
    job.allowPlusOne = popupDoc.getElementById('plusone').checked;
    job.allowArguments = !popupDoc.getElementById('arguments').checked;
    job.checkInline = popupDoc.getElementById('inline').checked;
    job.checkScripts = popupDoc.getElementById('scripts').checked;
    job.verboseInline = popupDoc.getElementById('verboseInline').checked;
    job.verboseScripts = popupDoc.getElementById('verboseScripts').checked;


    // Add the start page to the todo list.
    var startPage = popupDoc.getElementById('start').value;
    job.startPage = startPage;
    job.pagesTodo[startPage] = '[root page]';


    // Start spidering.
    job.started = true;
    job.storeJob();
    spiderPage(job);
}

/**
 *
 */
function showResultsPage() {
    /**
     * Record a reference to the results tab so that output may be
     * written there during spidering.
     * @param {Tab} The new tab.
     * @private
     */
    function resultsLoadCallback_(tab) {
        resultsTab = tab;
    }

    // Open a tab for the results.
    chrome.tabs.create({
        url: 'results.html'
    }, resultsLoadCallback_);
}

/**
 * Set the innerHTML of a named element with a message.  Escape the message.
 * @param {Document} doc Document containing the element.
 * @param {string} id ID of element to change.
 * @param {*} msg Message to set.
 */
function setInnerSafely(msg) {
    msg = msg.toString();
    msg = msg.replace(/&/g, '&amp;');
    msg = msg.replace(/</g, '&lt;');
    msg = msg.replace(/>/g, '&gt;');
    return msg;
}

/**
 * Cleanup after a spidering session.
 */
function popupStop(job) {
    started = false;
    pagesTodo = {};
    closeSpiderTab();
    resultsTab = null;
    window.clearTimeout(job.httpRequestWatchDogPid);
    window.clearTimeout(job.newTabWatchDogPid);
    // Reenable the Go button.
    popupDoc.getElementById('siteSpiderGo').disabled = false;
}

/**
 *  Start spidering one page.
 *
 * @param {Job} job
 */
function spiderPage(job) {

    if (taskCount() > TASK_LIMIT) {

        setTimeout(function () {
            spiderPage(job)
        }, 1000);

        checkTasks();

        return;
    }

    var task = new Task(job.id);
    job.tasks.push(task);
    var currentRequest = {
        requestedURL: null,
        returnedURL: null,
        referrer: null
    };

    task.currentRequest = currentRequest;

    if (job.paused) {
        return;
    }
    setStatus('Next page...', job);

    // Pull one page URL out of the todo list.
    var url;
    for (url in job.pagesTodo) {
        break;
    }
    if (!url) {
        // Done.
        setStatus('Complete', job);
        popupStop();
        return;
    }
    // Record page details.
    currentRequest.referrer = job.pagesTodo[url];
    currentRequest.requestedURL = url;
    task.url = url;
    job.spidering[url] = true;
    delete job.pagesTodo[url];

    // Fetch this page using Ajax.
    setStatus('Prefetching ' + url, job);
    job.httpRequestWatchDogPid = window.setTimeout(function () {
        httpRequestWatchDog(task);
    }, HEAD_REQUEST_TIMEOUT);

    var httpRequest = new XMLHttpRequest();
    task.httpRequest = httpRequest;

    httpRequest.onreadystatechange = function () {
        httpRequestChange(task);
    };
    httpRequest.open('GET', url, false);
    // For some reason this request only works intermitently when called directly.
    // Delay request by 1ms.
    window.setTimeout(function () {
        httpRequest.send(null);
    }, 1);
}

/**
 * Terminate an http request that hangs.
 */
function httpRequestWatchDog(task) {
    var httpRequest = task.httpRequest;
    var currentRequest = task.currentRequest;
    var job = getJob(task.jobId);
    setStatus('Aborting HTTP Request', job);
    if (httpRequest) {
        httpRequest.abort();
        // Log your miserable failure.
        currentRequest.returnedURL = null;
        task.httpRequest = null;
    }
    window.setTimeout(function () {
        spiderPage(getJob(task.jobId));
    }, 1);

    if (job.spidering[task.url]) {

        if (job.pagesError[task.url] && job.pagesError[task.url] > RETRY_MAX) {
            console.error("retry failed!");
            delete job.spidering[task.url];
        } else if (job.pagesError[task.url]) {
            job.pagesError[task.url]++
        } else {
            job.pagesError[task.url] = 1;
        }
    }
}

/**
 * Terminate a new tab that hangs (happens when a binary file downloads).
 */
function newTabWatchDog(task) {
    var currentRequest = task.currentRequest;
    setStatus('Aborting New Tab', getJob(task.jobId));
    closeSpiderTab(task.id);

    // Log your miserable failure.
    currentRequest.returnedURL = null;

    window.setTimeout(function () {
        spiderPage(getJob(task.jobId));
    }, 1);
}

/**
 * Callback for when the status of the Ajax fetch changes.
 */
function httpRequestChange(task) {
    var job = getJob(task.jobId);
    var httpRequest = task.httpRequest;
    var currentRequest = task.currentRequest;
    if (!httpRequest || httpRequest.readyState < 2) {
        // Still loading.  Wait for it.
        return;
    }
    var code = httpRequest.status;
    var mime = httpRequest.getResponseHeader('Content-Type') || '[none]';
    httpRequest = null;
    window.clearTimeout(job.httpRequestWatchDogPid);
    setStatus('Prefetched ' + currentRequest.requestedURL + ' (' + mime + ')', job);

    // 'SPIDER_MIME' is a list of allowed mime types.
    // 'mime' could be in the form of "text/html; charset=utf-8"
    // For each allowed mime type, check for its presence in 'mime'.
    var mimeOk = false;
    for (var x = 0; x < SPIDER_MIME.length; x++) {
        if (mime.indexOf(SPIDER_MIME[x]) != -1) {
            mimeOk = true;
            break;
        }
    }

    // If this is a redirect or an HTML page, open it in a new tab and
    // look for links to follow.  Otherwise, move on to next page.
    if (currentRequest.requestedURL.match(job.allowedRegex) &&
        (code < 300 && mimeOk)) {
        setStatus('Fetching ' + currentRequest.requestedURL, job);
        job.newTabWatchDogPid = window.setTimeout(function () {
            newTabWatchDog(task);
        }, HTTP_REQUEST_TIMEOUT);

        chrome.tabs.create({
            url: currentRequest.requestedURL,
            selected: false
        }, function (tab) {
            task.spiderTab = tab;
            spiderLoadCallback_(task);
        });
    } else {
        // Close this page and mark done.
        if (code != 200) {
            currentRequest.returnedURL = "HTTP Status " + code;
        }
        else {
            currentRequest.returnedURL = "Skipped " + mime;
        }

        window.setTimeout(function () {
            spiderPage(job);
        }, 1);
    }
}

/**
 * Inject the spider code into the newly opened page.
 * @param task The task of new tab.
 * @private
 */
function spiderLoadCallback_(task) {
    var spiderTab = task.spiderTab;
    setStatus('Spidering ' + spiderTab.url, getJob(task.jobId));

    if (!spiderTab || !spiderTab.id) {
        console.error(!spiderTab || !spiderTab.id);
    }

    chrome.tabs.executeScript(spiderTab.id, {
        code: 'window.site_spider_task_id="' + task.id + '"'
    });

    chrome.tabs.executeScript(spiderTab.id, {
        file: 'spider.js'
    });
}


// Add listener for message events from the injected spider code.
chrome.extension.onMessage.addListener(
    function (request, sender, sendResponse) {
        if ('content' in request) {
            saveContent(request.content, request.url);
        }
        if ('links' in request) {
            spiderInjectCallback(request.taskId, request.links, request.inline, request.scripts, request.url);
        }
        if ('stop' in request) {
            if (started) {
                if (request.stop == "Stopping") {
                    var task = getTask(request.taskId);

                    if (task) {
                        setStatus("Stopped", getJob(task.jobId));
                        popupStop(getJob(task.jobId));
                    }
                }
            }
        }

        if ('pause' in request) {

            pauseJob(request.id)
        }

        if ('pauseAll' in request) {
            jobs.forEach(function (job) {
                if (job && job.started) {
                    job.paused = true;
                    job.started = false;
                    job.storeJob();
                }
            })
        }

        if ('resume' in request) {

            var job = getJob(request.id);

            if (job && !job.started) {
                job.paused = false;
                job.started = true;
                job.storeJob();
                spiderPage(job);
            }

        }
        if ('download' in request) {
            if (request.download == "all") {
                downloadContent();
            } else {
                downloadContent(request.download);
            }
        }

        if ('result' in request) {
            chrome.tabs.sendMessage(sender.tab.id, {
                jobs: jobs,
                chart: chart
            });
        }

        if ('remove' in request) {
            removeJob(request.id);
        }

    }
);

/**
 * Process the data returned by the injected spider code.
 * @param {Array} links List of links away from this page.
 * @param {Array} inline List of inline resources in this page.
 */
function spiderInjectCallback(taskId, links, inline, scripts, url) {
    var task = getTask(taskId);
    var job = getJob(task.jobId);

    window.clearTimeout(job.newTabWatchDogPid);

    if (!task) {
        return;
    }

    var currentRequest = task.currentRequest;

    setStatus('Scanning ' + url, job);
    currentRequest.returnedURL = url;

    // In the case of a redirect this URL might be different than the one we
    // marked spidered above.  Mark this one as spidered too.
    job.pagesDone[currentRequest.requestedURL] = true;
    delete job.spidering[currentRequest.requestedURL];
    delete job.pagesError[currentRequest.requestedURL];

    var skippedlinks = [];
    if (job.checkInline) {
        links = links.concat(inline);
    }
    else {
        if (job.verboseInline)
            skippedlinks = skippedlinks.concat(inline);
    }
    if (job.checkScripts) {
        links = links.concat(scripts);
    }
    else {
        if (job.verboseScripts)
            skippedlinks = skippedlinks.concat(scripts);
    }

    // Add any new links to the Todo list.
    for (var x = 0; x < links.length; x++) {
        var link = links[x];
        link = trimAfter(link, '#');  // Trim off any anchor.
        if (link && !(link in job.pagesDone) && !(link in job.pagesTodo)) {
            if (job.allowArguments || link.indexOf('?') == -1) {
                if (link.match(job.allowedRegex) ||
                    (job.allowPlusOne && url.match(job.allowedRegex))) {
                    job.pagesTodo[link] = url;
                }
            }
        }
    }

    // Add found links to the found report
    if (job.verboseInline || job.verboseScripts) {
        for (var x = 0; x < skippedlinks.length; x++) {
            var skipRequest = currentRequest;
            var skippedlink = skippedlinks[x];
            skippedlink = trimAfter(skippedlink, '#');  // Trim off any anchor.
            if (skippedlink) {
                skipRequest.requestedURL = skippedlink;
                recordSkip(skipRequest);
            }
        }
    }

    if (!chart[job.id]) {
        chart[job.id] = [];
    }
    chart[job.id].push({data: new Date().getTime(), number: Object.keys(job.pagesTodo).length});

    storeChart(job.id);

    job.storeJob();

    // We want a slight delay before closing as a tab may have scripts loading
    window.setTimeout(function () {
        closeSpiderTab(taskId);
    }, 18);
    window.setTimeout(function () {
        spiderPage(job);
    }, 20);
}

function getProperName(name) {

    //get real name
    var url = name.split("?")[0];
    var params = name.split("?")[1];
    var pos = url.lastIndexOf("/");
    if (pos == -1) pos = url.lastIndexOf("\\")
    var filename = url.substr(pos + 1);

    filename = filename + (params ? "?" + params : "");
    if (!filename) {
        filename = "?";
    }
    return filename;
}

function getFilePath(path) {
    var newPath = path ? path.replace(/(?:https?|ftp):\/\/(.+)/g, '$1') : "";
    var index = newPath.indexOf("?");
    if (index > 0) {
        newPath = newPath.slice(0, index);
    }
    var arr = newPath.split("/");
    var last = arr.length;
    // 如果“/”是最后的一个字母，就不要处理之~
    (newPath.lastIndexOf("/") + 1) == newPath.length ? true : arr[last - 1] = "";
    return arr.join("/");
}


/**
 *
 */
function downloadContent() {

    downloading = true;

    var index = 0;

    function hasNext() {
        return index < localStorage.length;
    }

    function localStorage2zip(zipWriter) {
        var url = localStorage.key(index);
        var blob = new Blob([localStorage.getItem(url)], {
            type: 'text/html'
        });
        var filename = getFilePath(url) + getProperName(url);
        console.log('localStorage2zip', filename, url);

        zipWriter.add(filename, new zip.BlobReader(blob), function () {
            index++;
            if (hasNext()) {
                localStorage2zip(zipWriter);
            } else {

                zipWriter.close(function (blob) {
                    console.log('zipWriter.close');
                    var blobURL = URL.createObjectURL(blob);

                    var a = document.createElement('a');
                    a.href = blobURL;
                    a.download = "name.zip";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                    downloading = false;

                    localStorage.clear();

                }, function (message) {
                    console.error(message);
                    downloading = false;
                });
            }
        });
    }


    // 生成压缩工具
    zip.createWriter(new zip.BlobWriter(), function (zipWriter) {
        localStorage2zip(zipWriter);
    });
}


/**
 *
 * @param {*} content
 * @param {*} url
 */
function saveContent(content, url) {
    if (downloading) {
        setTimeout(function () {
            saveContent(content, url);
        }, 500);
    } else {
        try {
            localStorage.setItem(url, content);
        } catch (err) {
            downloadContent();
            saveContent(content, url);
        }
    }

}

function removeTab(id, callback) {
    setTimeout(function () {
        chrome.tabs.remove(id);
        callback();
    }, 100);
}

function closeSpiderTab(taskId) {
    console.log('close tab.');
    var task = getTask(taskId);

    if (task && task.spiderTab) {
        var removeTabCount = 0;
        var removeTabInterval = setInterval(function () {

            removeTabCount++;

            removeTab(task.spiderTab.id, function () {
                clearInterval(removeTabInterval);
            });

            if (removeTabCount > 10) {
                pauseJob(task.jobId);
                clearInterval(removeTabInterval);
            }
        }, 1000);

    } else {
        console.error("closeSpiderTab!! !task || !task.spiderTab");
    }

    if (task) {
        var job = getJob(task.jobId);
        job.removeTask(taskId);

        if (job.spidering[task.url]) {
            job.pagesTodo[task.url] = true;
            delete job.spidering[task.url];
        }
    }

}

function recordSkip(req) {
    var requestedURL = '<a href="' + req.requestedURL + '" target="spiderpage" title="' + req.requestedURL + '">' + req.requestedURL + '</a>';
    value = '<td><span title="' + req.referrer + '">' + req.referrer + '</span></td>' +
        '<td>' + requestedURL + '</td>';

    chrome.tabs.sendMessage(resultsTab.id, {
        id: "verbosebody",
        action: "insertBodyTR",
        value: value
    });
}

/**
 * Set the current status message to the results tab.
 * Print count of number of items left in queue.
 * @param {string} msg Status message.
 * @param {Job} job Status message.
 */
function setStatus(msg, job) {
    console.log(msg);
    if (job.started) {
        job.status = msg;
        job.storeJob();
    }
}

