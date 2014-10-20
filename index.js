var express = require('express')
var app = express();

app.set('port', (process.env.PORT || 8080))

var request = require('request');
var stats = require('./statistics');
var connection = require('./connection');
var configuration = require('./configuration');

var messageTimer = null


function pollMessages(){
    request(getRequestOptions("GET",'/messaging/messages',null), function(error, response, body){
        if(body == null){
            return;
        }

    //    console.log(JSON.stringify(body));
    console.log(body);
        for(var i = 0; i< body.length; i++){
            var message = body[i];

            if(message['__type'] == 'urn:inin.com:statistics:statisticValueMessage'){
                for(var s = 0; s< message.statisticValueChanges.length; s++){

                    var stat = message.statisticValueChanges[s];

                    if(stats.isWorkgroupStatistic(stat))
                    {
                        stats.addWorkgroupStatToCatalog(stat);
                    }
                }
            }
        }
    });
}

function startWorkgroupStatWatches(workgroupList){
    var statWatchData = [];

    for(var x=0; x< workgroupList.length; x++){
        var workgroup = workgroupList[x];

        for(var statKeyIndex = 0; statKeyIndex< stats.workgroupStats.length; statKeyIndex++){
            var statWatchParams = {
                "statisticIdentifier": stats.workgroupStats[statKeyIndex],
                "parameterValueItems": [{
                    "parameterTypeId": "ININ.People.WorkgroupStats:Workgroup",
                    "value": workgroup.configurationId.id
                }]
            };

            statWatchData.push(statWatchParams);

        }

        for(var statKeyIndex = 0; statKeyIndex< stats.workgroupIntervalStats.length; statKeyIndex++){
            var statWatchParams = {
                "statisticIdentifier": stats.workgroupIntervalStats[statKeyIndex],
                "parameterValueItems": [{
                    "parameterTypeId": "ININ.People.WorkgroupStats:Workgroup",
                    "value": workgroup.configurationId.id
                }, {
                    "parameterTypeId": "ININ.Queue:Interval",
                    "value": "CurrentShift"
                }]
            };

            statWatchData.push(statWatchParams);

        }
    }

    request(connection.getRequestOptions("PUT", "/messaging/subscriptions/statistics/statistic-values", {
        'statisticKeys': statWatchData
    }), function(error,response,body){

        //Start polling for messages
        messageTimer = setInterval(pollMessages, 2000);
    }); //end stat values put

}

//Log into CIC
function logIntoCICAndStartWatches(){
    console.log("Logging into cic server at " + configuration.cicUrl + " with user " + configuration.cicUser);
    request(connection.loginRequestOptions(configuration.cicUrl, configuration.cicUser, configuration.cicPassword), function(error, response, body){

        console.log("log in to the server is complete: " + response.statusCode);
        if(response.statusCode == 201){
            connection.connectionComplete(configuration.cicUrl, response.headers);

            if(configuration.workgroupFilter.length == 0)
            {

                request(connection.getRequestOptions("GET", "/configuration/workgroups", null), function(error,response,body){
                    //console.log(JSON.stringify(body));
                    var workgroups = [];
                    for(var x=0; x< body.items.length; x++){
                        var workgroup = body.items[x];
                        workgroups.push(workgroup.configurationId.id);
                    }

                    startWorkgroupStatWatches(workgroups);

                });//end workgroup get
            }
            else
            {
                startWorkgroupStatWatches(configuration.workgroupFilter);
            }
        }//end if logged in
    });//end log in request
}


logIntoCICAndStartWatches();

app.listen(app.get('port'), function() {
    console.log("Node app is running at localhost:" + app.get('port'))
})


app.get('/workgroupstatistics', function(request, response){
    response.send(stats.getWorkgroupStatCatalog());
})