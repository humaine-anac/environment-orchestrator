const envLoaded = require('dotenv').load({silent: true});
if (!envLoaded) console.log('warning:', __filename, '.env cannot be found');

const appSettings = require('./appSettings.json');
const http = require('http');
const express = require('express');
const path = require('path');
const {v1: uuidv1} = require('uuid');
const { logExpression, setLogLevel } = require('@cisl/zepto-logger');
const request = require('request-promise');
const methodOverride = require('method-override');
const bodyParser = require('body-parser');
const argv = require('minimist')(process.argv.slice(2));

const {allowMessage} = require('./enforce-rules');

let myPort = argv.port || appSettings.defaultPort || 14010;
let logLevel = 1;

if (argv.level) {
  logLevel = argv.level;
  logExpression(`Setting log level to ${logLevel}`);
}
setLogLevel(logLevel);

let defaultHumanBudget = {
  "currencyUnit": "USD",
  "value": 100
};

let GLOB = {
  negotiatorsInfo: appSettings.negotiatorsInfo,
  serviceMap: appSettings.serviceMap,
  humanBudget: appSettings.humanBudget || defaultHumanBudget,
  queue: [],
  totals: null
};

let warmUpTimer;
let roundTimer;
let postRoundTimer;
//ravel
let currentTurnID;

const app = express();

app.set('port', process.env.PORT || myPort);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.use(methodOverride());
app.use(express.static(path.join(__dirname, 'public')));

const getSafe = (p, o, d) =>
  p.reduce((xs, x) => (xs && xs[x] != null && xs[x] != undefined) ? xs[x] : d, o);

function wait(ms) {
  let timeout, prom;
  prom = new Promise((resolve) => {
    timeout = setTimeout(resolve, ms);
    logExpression("Set timer!", 2);
  });
  return {
    promise: prom,
    cancel: function() {clearTimeout(timeout);}
  };
}

let environmentUUID = uuidv1();

app.get('/sendOffer', (req, res) => {
  logExpression("Inside sendOffer (GET).", 2);
  if(req.query.text) {
    let message = {
      text: req.query.text,
      speaker: req.query.speaker || 'Human',
      addressee: req.query.addressee || null,
      role: req.query.role || 'buyer',
      environmentUUID: environmentUUID || null
    };

    let negotiatorIDs = GLOB.negotiatorsInfo.map(nBlock => {return nBlock.name;});
    let permission = allowMessage(message, GLOB.humanBudget.value, GLOB.queue);
    logExpression("permission is: ", 2);
    logExpression(permission, 2);

    if(permission.permit) {
      queueMessage(message); // Only queue message that has been permitted
      return sendMessages(sendMessage, message, negotiatorIDs)
      .then(responses => {
        let response = {
          "status": "Acknowledged",
          responses
        };

        res.json(response);
      })
      .catch(err => {
        res.send(500, err);
      });
    }
    else {
      let sender = GLOB.negotiatorsInfo.filter(nBlock => {return nBlock.name == message.speaker;})[0].name;
      message.rationale = permission.rationale;
      sendRejection(message, sender);
    }
  }
  else {
    res.send(500, {"msg": "No text supplied."});
  }
});

app.post('/relayMessage', (req, res) => {
  logExpression("Inside relayMessage (POST).", 2);
  if(req.body) {
    let message = req.body;
    logExpression("message: ", 2);
    logExpression(message, 2);
    let humanNegotiatorIDs = GLOB.negotiatorsInfo.filter(nBlock => {return nBlock.type == 'human';}).map(nBlock => {return nBlock.name;});
    let agentNegotiatorIDs = GLOB.negotiatorsInfo.filter(nBlock => {return nBlock.type == 'agent';}).map(nBlock => {return nBlock.name;});

    let permission = allowMessage(message, GLOB.humanBudget.value, GLOB.queue);
    logExpression("permission is: ", 2);
    logExpression(permission, 2);

    if(checkMessage(message) && permission.permit) {
      queueMessage(message); // Only queue message that has been permitted
      updateTotals(message);
      let allResponses;
      return sendMessages(sendMessage, message, humanNegotiatorIDs)
      .then(humanResponses => {
        allResponses = humanResponses;
        logExpression("allResponses from human is: ", 2);
        logExpression(allResponses);
        if(message.bid) delete message.bid; // Don't let other agents see the bid itself.
        return sendMessages(sendMessage, message, agentNegotiatorIDs);
      })
      .then(agentResponses => {
        allResponses = allResponses.concat(agentResponses);
        let response = {
          "status": "Acknowledged",
          allResponses
        };

        res.json(response);
      })
      .catch(err => {
        res.status(500).send(err);
      });
    }
    else {
      logExpression("Rejected message!", 2);
      logExpression(message, 2);
      logExpression(GLOB.negotiatorsInfo, 2);
      let sender = GLOB.negotiatorsInfo.filter(nBlock => {
        return ((nBlock.name == message.speaker) ||
            (nBlock.name == "chat-ui" && message.speaker == "Human"));})[0].name;
      logExpression("sender is: ", 2);
      logExpression(sender, 2);
      message.rationale = permission.rationale;
      sendRejection(message, sender);
    }
  }
  else {
    res.status(500).send({"msg": "No valid message supplied.", message});
  }
});

app.get('/viewQueue', (req, res) => {
  res.json(GLOB.queue);
});

app.get('/viewTotals', (req, res) => {
  res.json(GLOB.totals);
});

app.post('/calculateUtility/:agentName', (req, res) => {
  logExpression("In /calculateUtility (POST).", 2);
  logExpression(GLOB.negotiatorsInfo, 2);
  let agentName = req.params.agentName;
  let negotiatorsInfo = GLOB.negotiatorsInfo.filter(nBlock => {return nBlock.name == agentName;});
  logExpression("In /calculateUtility (POST), negotiatorsInfo is: ", 2);
  logExpression(negotiatorsInfo, 2);

  let negotiatorInfo = null;
  let utilityInfo = null;
  if(negotiatorsInfo && negotiatorsInfo.length) {
    negotiatorInfo = negotiatorsInfo[0];
    if(negotiatorInfo.utilityFunction) {
      utilityInfo = JSON.parse(JSON.stringify(negotiatorInfo.utilityFunction));
    }
  }
  logExpression("utilityInfo: ", 2);
  logExpression(utilityInfo, 2);

  if(req.body && utilityInfo) {
    utilityInfo.bundle = req.body;
    let agentType = negotiatorInfo.type;
    logExpression("utilityInfo: ", 2);
    logExpression(utilityInfo, 2);
    return calculateUtility(agentType, utilityInfo)
    .then(calculatedUtility => {
      res.json(calculatedUtility);
    })
    .catch(error => {
      res.status(500).send(error);
    });
  }
  else {
    let error = {"msg": "No POST body supplied, or else no negotiators."};
    res.status(500).send(error);
  }
});

app.post('/receiveHumanAllocation', (req, res) => {
  logExpression("Just called /receiveHumanAllocation with body: ", 2);
  logExpression(req.body, 2);
  let msg = null;
  if(GLOB.totals.Human && req.body) {
    GLOB.totals.Human.allocation = req.body;
    msg = {"status": "Acknowledged"};
  }
  else {
    msg = {"status": "Failed", "Reason": "No body supplied."};
  }
  logExpression(msg, 2);
  res.json(msg);
});

app.post('/startRound', (req, res) => {
  logExpression("Inside /startRound (POST).", 2);

  if(req.body) {
    logExpression("Received body: ", 2);
    logExpression(req.body, 2);

    if(warmUpTimer) {
      warmUpTimer.cancel();
      logExpression("Just cleared warmupTimer.", 2);
    }

    if(roundTimer) {
      roundTimer.cancel();
      logExpression("Just cleared roundTimer.", 2);
    }

    if(postRoundTimer) {
      postRoundTimer.cancel();
      logExpression("Just cleared postRoundTimer.", 2);
    }

    let roundInfo = req.body;
    let roundNumber = roundInfo.roundNumber;
    let durations = roundInfo.durations;
    //ravel
    currentTurnID = 0;
    let proms = [];

    let serviceMap = JSON.parse(JSON.stringify(appSettings.serviceMap));
    let negotiatorsInfo = JSON.parse(JSON.stringify(appSettings.negotiatorsInfo));
    let humanUtility = getSafe(['human', 'utilityFunction'], roundInfo, null);
    negotiatorsInfo = negotiatorsInfo.map(negotiatorInfo => {
      logExpression("Filling in human Info.", 2);
      logExpression(negotiatorInfo, 2);
      if(negotiatorInfo.type == 'human') negotiatorInfo.utilityFunction = humanUtility;
      logExpression(negotiatorInfo, 2);
      return negotiatorInfo;
    });

    roundInfo.agents.forEach(agentInfo => {
      serviceMap[agentInfo.name] = {
        "protocol": agentInfo.protocol || "http",
        "host": agentInfo.host,
        "port": agentInfo.port
      };
      agentInfo.type = 'agent';
      agentInfo.role = 'seller';
      negotiatorsInfo.push(agentInfo);
    });
    GLOB.serviceMap = serviceMap;
    GLOB.negotiatorsInfo = negotiatorsInfo;
    GLOB.queue = [];
    GLOB.totals = {};
    GLOB.humanBudget = JSON.parse(JSON.stringify(appSettings.humanBudget)) || defaultHumanBudget;
    let negotiatorIDs = negotiatorsInfo.map(nBlock => {return nBlock.name;});
    let humanNegotiatorIDs = GLOB.negotiatorsInfo.filter(nBlock => {return nBlock.type == 'human';}).map(nBlock => {return nBlock.name;});

    negotiatorsInfo.forEach(negotiatorInfo => {
      let utilityInfo = negotiatorInfo.utilityFunction;
      let prom;
      if(utilityInfo) {
        utilityInfo.name = getSafe(['name'], negotiatorInfo, null);
        logExpression(utilityInfo, 2);
        prom = sendUtilityInfo(negotiatorInfo.name, utilityInfo);
      } else {
        prom = Promise.resolve(null);
      }
      proms.push(prom);
    });

    Promise.all(proms)
    .then(values => {
      logExpression("Promise all results: ", 2);
      logExpression(values, 2);
      return values;
    })
    .then(agentResponses => {
      res.json(agentResponses);
      let roundMetadata = {
        roundNumber,
        durations,
        humanBudget: GLOB.humanBudget
      };
      sendMessages(sendRoundMetadata, roundMetadata, humanNegotiatorIDs);
      warmUpTimer = wait(1000 * durations.warmUp);
      warmUpTimer.promise.then(() => {
        logExpression("warmUpTimer has expired.", 2);
        let startRoundMessage = {
          roundDuration: durations.round,
          roundNumber: roundNumber,
          timestamp: new Date()
        };
        sendMessages(startRound, startRoundMessage, negotiatorIDs);
      })
      .then(() => {
        roundTimer = wait(1000 * durations.round);
        roundTimer.promise.then(() => {
          logExpression("roundTimer has expired.", 2);
          let endRoundMessage = {
            roundNumber: roundNumber,
            timestamp: new Date()
          };
          sendMessages(endRound, endRoundMessage, negotiatorIDs);
        })
        .then(() => {
          postRoundTimer = wait(1000 * durations.post);
          postRoundTimer.promise.then(() => {
            logExpression("postRoundTimer has expired.", 2);
            return summarizeResults()
            .then(roundTotals => {
              let roundTotalsMessage = {
                roundNumber,
                roundTotals
              };
              logExpression("I am sending this results message to the human negotiator IDs: ", 2);
              logExpression(roundTotalsMessage, 2);
              logExpression(humanNegotiatorIDs, 2);
              sendMessages(totalRound, roundTotalsMessage, humanNegotiatorIDs);
            });
          });
        });
      });
    })
    .catch(err => {
      res.json(err);
    });
  }
  else {
    res.json({"msg": "No POST body provided."});
  }
});

http.createServer(app).listen(app.get('port'), () => {
  logExpression('Express server listening on port ' + app.get('port'), 2);
});


function checkMessage(msg) {
  return msg.text && msg.text.length &&
    msg.speaker && msg.speaker.length &&
    (msg.role == 'buyer' || msg.role == 'seller');
}

function queueMessage(message) {
  logExpression("In queueMessage, message is: ", 3);
  logExpression(message, 3);
  let msg = JSON.parse(JSON.stringify(message));
  GLOB.queue.push({
    msg,
    timeStamp: new Date()
  });
  logExpression("------CHECK QUEUE-----", 2);
  logExpression(GLOB.queue, 2);
  logExpression("----------------------", 2);
  return;
}

function calculateUtility(agentRole, utilityBundle) {
  logExpression("In calculateUtility, contacting negotiator of role " + agentRole + " with utility bundle: ", 2);
  logExpression(utilityBundle, 2);
  return postDataToServiceType(utilityBundle, 'utility-generator', '/calculateUtility/' + agentRole);
}

function sendUtilityInfo(negotiatorID, utilityInfo) {
  logExpression("In sendUtilityInfo, sending utility information: ", 2);
  logExpression(utilityInfo, 2);
  logExpression("To the recipient: ", 2);
  logExpression(negotiatorID, 2);
  return postDataToServiceType(utilityInfo, negotiatorID, '/setUtility');
}

function sendMessage(message, negotiatorID) {
  logExpression("In sendMessage, sending message: ", 2);
  logExpression(message, 2);
  logExpression("To the recipient: ", 2);
  logExpression(negotiatorID, 2);
  return postDataToServiceType(message, negotiatorID, '/receiveMessage');
}

function sendRejection(message, negotiatorID) {
  logExpression("In sendRejection, sending message: ", 2);
  logExpression(message, 2);
  logExpression("To the recipient: ", 2);
  logExpression(negotiatorID, 2);
  return postDataToServiceType(message, negotiatorID, '/receiveRejection');
}

function startRound(message, negotiatorID) {
  logExpression("In startRound, sending message: ", 2);
  logExpression(message, 2);
  logExpression("To the recipient: ", 2);
  logExpression(negotiatorID, 2);
  return postDataToServiceType(message, negotiatorID, '/startRound');
}

function endRound(message, negotiatorID) {
  logExpression("In endRound, sending message: ", 2);
  logExpression(message, 2);
  logExpression("To the recipient: ", 2);
  logExpression(negotiatorID, 2);
  return postDataToServiceType(message, negotiatorID, '/endRound');
}

function sendRoundMetadata(message, negotiatorID) {
  logExpression("In sendRoundMetadata, sending message: ", 2);
  logExpression(message, 2);
  logExpression("To the recipient: ", 2);
  logExpression(negotiatorID, 2);
  return postDataToServiceType(message, negotiatorID, '/sendRoundMetadata');
}

function totalRound(message, negotiatorID) {
  logExpression("In totalRound, sending message: ", 2);
  logExpression(message, 2);
  logExpression("To the recipient: ", 2);
  logExpression(negotiatorID, 2);
  return postDataToServiceType(message, negotiatorID, '/receiveRoundTotals');
}

function updateTotals(message) {
  let bidType = getSafe(['bid', 'type'], message, null);
  if(bidType == 'Accept') {
    // do stuff
    let agents = [message.speaker, message.addressee];
    if(!GLOB.totals) GLOB.totals = {};
    agents.forEach(agent => {
      if(!GLOB.totals[agent]) {
        GLOB.totals[agent] = {
          price: 0.0,
          quantity:{}
        };
      }
      let bundlePrice =  getSafe(['bid', 'price', 'value'], message, 0.0);
      if(agent == 'Human') GLOB.humanBudget.value -= bundlePrice;
      GLOB.totals[agent].price += bundlePrice;
      Object.keys(message.bid.quantity).forEach(good => {
        if(!GLOB.totals[agent].quantity[good]) GLOB.totals[agent].quantity[good] = 0;
        GLOB.totals[agent].quantity[good] += getSafe(['bid', 'quantity', good], message, 0);
      });
    });
    logExpression("Round totals updated to: ", 2);
    logExpression(GLOB.totals, 2);
  }
  return;
}

function summarizeResults() {
  logExpression("Just got inside summarizeResults.", 2);
  let summary = {};
  let proms = [];
  GLOB.negotiatorsInfo.forEach(negotiatorInfo => {
    logExpression("negotiatorInfo is: ", 2);
    logExpression(negotiatorInfo, 2);
    let agentName = negotiatorInfo.name;
    if(agentName == "chat-ui" || agentName == "human-ui") agentName = "Human"; // HACK !! We need to differentiate between name of UI and name of user of the UI
    if(GLOB.totals[agentName] && !summary[agentName]) { // Don't duplicate utility information for e.g. chatUI and humanUI, which both serve the same human
      summary[agentName] = {
        quantity: GLOB.totals[agentName].quantity
      };
      let utilityInfo = negotiatorInfo.utilityFunction;
      if(negotiatorInfo.role == 'seller') {
        logExpression("Seller!", 2);
        summary[agentName].revenue = GLOB.totals[agentName].price;
        utilityInfo.bundle = JSON.parse(JSON.stringify(GLOB.totals[agentName]));
      }
      else if (negotiatorInfo.role == 'buyer') {
        logExpression("Buyer!", 2);
        summary[agentName].cost = GLOB.totals[agentName].price;
        utilityInfo.bundle = {
          cost: JSON.parse(JSON.stringify(GLOB.totals[agentName])).price,
          products: JSON.parse(JSON.stringify(GLOB.totals[agentName])).allocation || {}
        };
      }
      logExpression("Just before proms.push, utilityInfo is: ", 2);
      logExpression(utilityInfo, 2);
      proms.push(calculateUtility(negotiatorInfo.type, utilityInfo));
    }
  });
  return Promise.all(proms)
  .then(utilities => {
    logExpression("Utilities: ", 2);
    logExpression(utilities, 2);
    Object.keys(summary).forEach((agentName,i) => {
      summary[agentName].utility = utilities[i];
    });
    return summary;
  })
  .catch(err => {
    logExpression("Error in Promise.all: ", 2);
    logExpression(err, 2);
    return Promise.resolve(null);
  });
}

function sendMessages(func, message, negotiatorIDs) {
  let proms = [];
  negotiatorIDs.forEach(negotiatorID => {
    let prom = func(message, negotiatorID).then(response => {
      logExpression("Received response from message sent to " + negotiatorID, 2);
      logExpression(response, 2);
      return response;
    })
    .catch(e => {
      logExpression("Encountered error: ", 2);
      logExpression(e, 2);
      return null;
    });
    proms.push(prom);
  });
  return Promise.all(proms)
  .then(values => {
    logExpression("Values: ", 2);
    logExpression(values, 2);
    return values;
  })
  .catch(err => {
    logExpression("Error in Promise.all: ", 2);
    logExpression(err, 2);
    return Promise.resolve(null);
  });
}

function postDataToServiceType(json, serviceID, path) {
  let serviceMap = GLOB.serviceMap;
  if(serviceMap[serviceID]) {
    let options = serviceMap[serviceID];
    options.path = path;
    let url = options2URL(options);
    let rOptions = {
      method: 'POST',
      uri: url,
      body: json,
      json: true
    };
    return request(rOptions)
    .then(response => {
      return response;
    })
    .catch(error => {
      logExpression("Error: ", 1);
      logExpression(error, 1);
      return null;
    });
  }
}

function options2URL(options) {
  let protocol = options.protocol || 'http';
  let url = protocol + '://' + options.host;
  if (options.port) url += ':' + options.port;
  if (options.path) url  += options.path;
  return url;
}

// Bad old code, just in case
//app.get('/startRoundOld', (req, res) => {
//  logExpression("Inside /startRound (GET).", 2);
//
//  let round = req.query.round || 0;
//
//  let environmentUUID = appSettings.environmentUUID || 'abcdefgh';
//
//  let negotiators = appSettings.negotiatorInfo;
//  negotiators = negotiators.map(nBlock => {nBlock.environmentUUID = environmentUUID; return nBlock;});
//  let negotiatorIDs = negotiators.map(nBlock => {return nBlock.id;});
//
//  initializeUtilities(negotiators)
//  .then(agentResponses => {
//    res.json(agentResponses);
//    wait(1000 * roundWarmupDuration)
//    .then(() => {
//      let startRoundMessage = {
//        roundDuration: roundDuration,
//        roundNumber: round,
//        timestamp: new Date()
//      };
//      sendMessages(startRound, startRoundMessage, negotiatorIDs);
//    })
//    .then(() => {
//      wait(1000 * roundDuration)
//      .then(() => {
//        let endRoundMessage = {
//          roundNumber: round,
//          timestamp: new Date()
//        };
//        sendMessages(endRound, endRoundMessage, negotiatorIDs);
//      });
//    });
//  })
//  .catch(err => {
//    res.json(err);
//  });
//});
//
//function initializeUtilitiesOld(negotiators) {
//  let proms = [];
//  negotiators.forEach(negotiatorInfo => {
//    let prom = getUtilityInfo(negotiatorInfo)
//    .then(utilityInfo => {
//      utilityInfo.name = negotiatorInfo.name;
//      logExpression("For negotiator " + negotiatorInfo.id + ", utility is: ", 2);
//      logExpression(utilityInfo, 2);
//      return sendUtilityInfo(negotiatorInfo, utilityInfo)
//      .then(response => {
//        logExpression("Received response from utility message sent to " + negotiatorInfo.id, 2);
//        logExpression(response, 2);
//        return response;
//      })
//      .catch(e => {
//        logExpression("Encountered error: ", 2);
//        logExpression(e, 2);
//        return null;
//      });
//    });
//    proms.push(prom);
//  });
//  return Promise.all(proms)
//  .then(values => {
//    logExpression("Values: ", 2);
//    logExpression(values, 2);
//    return values;
//  })
//  .catch(err => {
//    logExpression("Error in Promise.all: ", 2);
//    logExpression(err, 2);
//    return Promise.resolve(null);
//  });
//}

//function initializeUtilities(negotiators) {
//  let proms = [];
//  negotiators.forEach(negotiatorInfo => {
//    let prom = getUtilityInfo(negotiatorInfo)
//    .then(utilityInfo => {
//      utilityInfo.name = negotiatorInfo.name;
//      logExpression("For negotiator " + negotiatorInfo.id + ", utility is: ", 2);
//      logExpression(utilityInfo, 2);
//      return sendUtilityInfo(negotiatorInfo, utilityInfo)
//      .then(response => {
//        logExpression("Received response from utility message sent to " + negotiatorInfo.id, 2);
//        logExpression(response, 2);
//        return response;
//      })
//      .catch(e => {
//        logExpression("Encountered error: ", 2);
//        logExpression(e, 2);
//        return null;
//      });
//    });
//    proms.push(prom);
//  });
//  return Promise.all(proms)
//  .then(values => {
//    logExpression("Values: ", 2);
//    logExpression(values, 2);
//    return values;
//  })
//  .catch(err => {
//    logExpression("Error in Promise.all: ", 2);
//    logExpression(err, 2);
//    return Promise.resolve(null);
//  });
//}

//function getDataFromServiceType(serviceType, path) {
//  let serviceMap = appSettings.serviceMap;
//  logExpression("Inside getDataFromServiceType", 2);
//  if(serviceMap[serviceType]) {
//    let options = serviceMap[serviceType];
//    options.path = path;
//    let url = options2URL(options);
//    let rOptions = {
//      method: 'GET',
//      uri: url
//    };
//    logExpression("In getDataFromServiceType, rOptions is: ", 2);
//    logExpression(rOptions, 2);
//    return request(rOptions)
//    .then(response => {
//      logExpression("Got response: ", 2);
//      logExpression(response, 2);
//      return response;
//    })
//    .catch(error => {
//      logExpression("Error: ", 1);
//      logExpression(error, 1);
//      return null;
//    });
//  }
//}

//// Test route for calculateUtility
//app.get('/calculateUtility/:agentType', (req, res) => {
//  let agentType = req.params.agentType;
//  let utilityBundle;
//  if(agentType == 'human') {
//    utilityBundle = require('./buyerUtilityBundle.json');
//  }
//  else {
//    utilityBundle = require('./sellerUtilityBundle.json');
//  }
//  return calculateUtility(agentType, utilityBundle)
//  .then(calculatedUtility => {
//    res.json(calculatedUtility);
//  })
//  .catch(error => {
//    res.status(500).send(error);
//  });
//});
