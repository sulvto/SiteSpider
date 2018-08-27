var app = new Vue({
    el: '#app',
    data: {
        jobs: [],
        chart: {}
    },
    watch: {

        chart: function (chart, oldQuestion) {
            for (var id in chart) {
                var xAxis = [];
                var yAxis = [];
                for (var i = 0; i < chart[id].length; i++) {
                    xAxis.push(new Date(chart[id][i].data));
                    yAxis.push(chart[id][i].number);
                }

                var option = {
                    xAxis: {
                        type: 'category',
                        data: xAxis
                    },
                    yAxis: {
                        type: 'value'
                    },
                    series: [{
                        data: yAxis,
                        type: 'line'
                    }]
                };

                var chartEle = document.getElementById('chart_' + id);
                if (chartEle) {
                    var myChart = echarts.init(chartEle);
                    myChart.setOption(option);
                }

            }
        }

    },
    methods: {

        stopSpider: function (event) {
            if (event.target.value == "Stop") {
                event.target.value = "Stopping";
            }
            chrome.runtime.sendMessage({
                stop: event.target.value
            });
        },

        resumeSpider: function (id) {

            chrome.runtime.sendMessage({
                resume: true,
                id: id
            });

            getResultsInfo();
        },

        pauseSpider: function (id) {

            chrome.runtime.sendMessage({
                pause: true,
                id: id
            });

            getResultsInfo();
        },

        download: function () {
            chrome.runtime.sendMessage({
                download: 'all'
            });
        },

        remove: function (id) {
            chrome.runtime.sendMessage({
                remove: true,
                id: id
            });
        }
    }
});


function messageDispatch(request, sender, sendResponse) {
    var element = null;
    //what are we using
    switch (request.method) {
        case "getElementById":
            element = document.getElementById(request.id);
            break;
        case "getElementsByTag":
            element = document.getElementById(request.id);
            break;
    }
    //what are we doing
    switch (request.action) {
        case "getInnerHTML":
            sendResponse(element.innerHTML);
            break;
        case "getValue":
            sendResponse(element.value);
            break;
        case "setInnerHTML":
            element.innerHTML = request.value;
            break;
        case "setValue":
            element.value = request.value;
            break;
        case "insertBodyTR":
            insertBodyTR(request.id, request.value);
            break;
        case "show":
            document.getElementById(request.id).style.display = "inline";
            break;
        case "hide":
            document.getElementById(request.id).style.display = "none";
            break;
    }

    if (request.jobs) {
        flushData(request.jobs, request.chart);
    }
}

function pageLoaded() {
    chrome.runtime.onMessage.addListener(messageDispatch);
}

function insertBodyTR(id, innerHTML) {
    var tbody = document.getElementById(id);
    var tr = document.createElement('tr');
    tr.innerHTML += innerHTML
    tbody.appendChild(tr);
}

function flushData(jobs, chart) {
    app.jobs = jobs;
    app.chart = chart;

    app.jobs.forEach(function (job) {
        job.queueCount = Object.keys(job.pagesTodo).length;
        job.doneCount = Object.keys(job.pagesDone).length;
        job.errorCount = Object.keys(job.pagesError).length;
        job.queue = Object.keys(job.pagesTodo).map(function (page) {
            return {url: page, referrer: job.pagesTodo[page]};
        });
    });

}

function getResultsInfo() {
    chrome.runtime.sendMessage({
        result: true
    });
}

window.addEventListener("load", pageLoaded);

setInterval(function () {
    getResultsInfo();
}, 5000);




                    