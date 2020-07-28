const envLoaded = require('dotenv').load({silent: true});
if (!envLoaded) console.log('warning:', __filename, '.env cannot be found');

const appSettings = require('./appSettings.json');
const http = require('http');
const express = require('express');
const {get} = require('lodash');
const { logExpression, setLogLevel } = require('@cisl/zepto-logger');
const { optionsToUrl } = require('@humaine/utils/url');
const request = require('request-promise');
const argv = require('minimist')(process.argv.slice(2));

const {allowMessage} = require('./enforce-rules');

let myPort = argv.port || appSettings.defaultPort || 14010;
let logLevel = 1;
const rounds = {};
let responseTimeLimit = appSettings.responseTimeLimit || 4000;
let canTalkAtOnce = appSettings.canTalkAtOnce;

if (argv.level) {
  logLevel = argv.level;
  logExpression(`Setting log level to ${logLevel}`);
}
setLogLevel(logLevel);

let defaultHumanBudget = {
  "currencyUnit": "USD",
  "value": 100
};

const app = express();

app.set('port', process.env.PORT || myPort);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _, next) => {
  logExpression(`Inside ${req.url} (${req.method}).`, 2);
  next();
})

function wait(ms) {
  let timeout, prom;
  prom = new Promise((resolve) => {
    timeout = setTimeout(resolve, ms);
    logExpression("Set timer!", 2);
  });
  return {
    promise: prom,
    cancel: () => clearTimeout(timeout),
  };
}

app.get('/sendOffer', (req, res) => {
  if (!req.query.text) {
    return res.send(500, {"msg": "No text supplied."});
  }

  const roundId = req.query.roundId;
  const roundInfo = rounds[roundId];

  let message = {
    roundId,
    text: req.query.text,
    speaker: req.query.speaker || 'Human',
    addressee: req.query.addressee || null,
    role: req.query.role || 'buyer',
  };

  let humanNegotiatorIDs = roundInfo.negotiatorsInfo.filter(nBlock => nBlock.type === 'human').map(nBlock => nBlock.name);
  let negotiatorIDs = roundInfo.negotiatorsInfo.map(nBlock => nBlock.name);
  let permission = allowMessage(message, roundInfo.humanBudget.value, roundInfo.queue, responseTimeLimit, canTalkAtOnce);
  logExpression("permission is: ", 2);
  logExpression(permission, 2);

  sendMessages(sendLog, Object.assign({}, message, {
    permitted: permission.permit,
    rationale: permission.rationale
  }), humanNegotiatorIDs);

  if(permission.permit) {
    queueMessage(roundInfo.queue, message); // Only queue message that has been permitted
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
    let sender = roundInfo.negotiatorsInfo.filter(nBlock => nBlock.name === message.speaker)[0].name;
    message.rationale = permission.rationale;
    sendRejection(message, sender);
  }
});

app.post('/relayMessage', async (req, res) => {
  if (!req.body) {
    return res.status(500).send({"msg": "No valid message supplied.", message});
  }

  let message = req.body;
  logExpression("message: ", 2);
  logExpression(message, 2);

  const roundId = req.body.roundId;

  roundInfo = rounds[roundId];
  let humanNegotiatorIDs = roundInfo.negotiatorsInfo.filter(nBlock => nBlock.type === 'human').map(nBlock => nBlock.name);
  let agentNegotiatorIDs = roundInfo.negotiatorsInfo.filter(nBlock => nBlock.type === 'agent').map(nBlock => nBlock.name);

  let permission = allowMessage(message, roundInfo.humanBudget.value, roundInfo.queue, responseTimeLimit, canTalkAtOnce);
  logExpression("permission is: ", 2);
  logExpression(permission, 2);

  const logMessage = (message, permitted, rationale) => {
    sendMessages(sendLog, Object.assign({}, message, {
      permitted: permitted,
      rationale: rationale
    }), humanNegotiatorIDs);
  }

  const rejectMessage = (rationale) => {
    logExpression("Rejected message!", 2);
    logExpression(message, 2);
    logExpression(roundInfo.negotiatorsInfo, 2);
    let sender = roundInfo.negotiatorsInfo.filter(nBlock => {
      return ((nBlock.name == message.speaker) || (["chat-ui", "competition-ui"].includes(nBlock.name) && message.speaker == "Human"));
    })[0].name;
    logExpression("sender is: ", 2);
    logExpression(sender, 2);
    message.rationale = rationale;
    sendRejection(message, sender);
    logMessage(message, false, message.rationale);
    return res.json({
      status: 'Acknowledged',
    });
  }

  const bidType = get(message, ['bid', 'type'], null);

  if (message['speaker'].toLowerCase() !== "human" && bidType && ['Accept', 'AcceptOffer', 'SellOffer'].includes(bidType)) {
    // check if quantities exist and all have values
    if (Object.keys(message['bid']['quantity']).length === 0) {
      permission.permit = false;
      permission.rationale = 'no items included in bid offer';
    }
    else {
        for (let item in message['bid']['quantity']) {
            if (message['bid']['quantity'][item] == undefined) {
              permission.permit = false;
              permission.rationale = `did not include valid quantity for item '${item}'`;
              break;
            }
        }
    }

    // check if price exists
    if (Object.keys(message['bid']['price']).length === 0 || message['bid']['price']['value'] == undefined) {
      permission.permit = false;
      permission.rationale = 'did not include price in bid offer';
    }
  }

  if (checkMessage(message) && permission.permit) {
    if (get(message, ['bid', 'type'], null) === 'Accept') {
      let responses = await sendMessages(sendConfirmAccept, message, humanNegotiatorIDs);
      for (const response of responses) {
        if (response.status !== 'acknowledged') {
          return rejectMessage('User rejected bid offer');
        }
      }
      updateTotals(roundInfo, message);
    }
    logMessage(message, true, null);
    queueMessage(roundInfo.queue, message);

    const agentMessage = Object.assign({}, message);
    if (agentMessage.bid !== undefined) {
      delete agentMessage.bid;
    }

    try {
      const promises = [];
      promises.push(sendMessages(sendMessage, message, humanNegotiatorIDs));
      promises.push(sendMessages(sendMessage, agentMessage, agentNegotiatorIDs));

      const responses = await Promise.all(promises);

      logExpression('allResponses from human is: ', 2);
      logExpression(responses[0]);

      const allResponses = [...responses[0], ...responses[1]];

      res.json({
        status: 'Acknowledged',
        allResponses
      });
    }
    catch (exc) {
      res.status(500).send(err);
    }
  }
  else {
    return rejectMessage(permission.rationale);
  }
});

app.get('/viewQueue/:roundId', (req, res) => {
  return res.json(rounds[req.params.roundId].queue);
});

app.get('/viewTotals/:roundId', (req, res) => {
  return res.json(rounds[req.params.roundId].totals);
});

app.post('/calculateUtility/:agentName', (req, res) => {
  const roundId = req.body.roundId;
  const roundInfo = rounds[roundId];
  logExpression(roundInfo.negotiatorsInfo, 2);
  let agentName = req.params.agentName;
  let negotiatorsInfo = roundInfo.negotiatorsInfo.filter(nBlock => {return nBlock.name == agentName;});
  logExpression("negotiatorsInfo is: ", 2);
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

  if(!req.body || !utilityInfo) {
    return res.status(500).send({"msg": "No POST body supplied, or else no negotiators."});
  }

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
});

app.post('/receiveHumanAllocation', (req, res) => {
  const roundId = req.body.roundId;
  const roundInfo = rounds[roundId];
  logExpression("Received body: ", 2);
  logExpression(req.body, 2);
  let msg = null;
  if(roundInfo.totals.Human && req.body) {
    roundInfo.totals.Human.allocation = req.body.payload;
    msg = {roundId, "status": "Acknowledged"};
  }
  else {
    msg = {roundId, "status": "Failed", "Reason": "No body supplied."};
  }
  logExpression(msg, 2);
  res.json(msg);
});

app.post('/initializeRound', (req, res) => {
  if (!req.body) {
    return res.json({msg: 'No POST body provided'});
  }

  logExpression("Received body: ", 2);
  logExpression(req.body, 2);

  rounds[req.body.roundId] = req.body;
  res.json({roundId: req.body.roundId, msg: 'Done'});
});

app.post('/startRound', async (req, res) => {
  if(!req.body) {
    return res.json({"msg": "No POST body provided."});
  }

  let roundId;
  let roundInfo;
  if(appSettings.standalone) {
    roundId = "true";
    rounds[roundId] = req.body;
  } else {
    roundId = req.body.roundId;
  }
  roundInfo = rounds[roundId];
  let durations = roundInfo.durations;

  logExpression("Received body: ", 2);
  logExpression(req.body, 2);

  if (roundInfo.warmUpTimer) {
    roundInfo.warmUpTimer.cancel();
    logExpression("Just cleared warmupTimer.", 2);
  }

  if (roundInfo.roundTimer) {
    roundInfo.roundTimer.cancel();
    logExpression("Just cleared roundTimer.", 2);
  }

  if (roundInfo.postRoundTimer) {
    roundInfo.postRoundTimer.cancel();
    logExpression("Just cleared postRoundTimer.", 2);
  }

  //ravel
  let proms = [];

  let serviceMap = JSON.parse(JSON.stringify(appSettings.serviceMap));
  let negotiatorsInfo = JSON.parse(JSON.stringify(appSettings.negotiatorsInfo));
  let humanUtility = get(roundInfo, ['human', 'utilityFunction'], null);
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
  roundInfo.serviceMap = serviceMap;
  roundInfo.negotiatorsInfo = negotiatorsInfo;
  roundInfo.queue = [];
  roundInfo.totals = {};
  roundInfo.humanBudget = JSON.parse(JSON.stringify(appSettings.humanBudget)) || defaultHumanBudget;
  let negotiatorIDs = negotiatorsInfo.map(nBlock => nBlock.name);
  let humanNegotiatorIDs = roundInfo.negotiatorsInfo.filter(nBlock => nBlock.type === 'human').map(nBlock => nBlock.name);

  try {
    let roundMetadata = {
      roundId,
      durations,
      humanBudget: roundInfo.humanBudget
    };
    await sendMessages(sendRoundMetadata, roundMetadata, humanNegotiatorIDs);

    negotiatorsInfo.forEach(negotiatorInfo => {
      let utilityInfo = negotiatorInfo.utilityFunction;
      let prom;
      if (utilityInfo) {
        utilityInfo.name = get(negotiatorInfo, ['name'], null);
        utilityInfo.roundId = roundId;
        logExpression(utilityInfo, 2);
        prom = sendUtilityInfo(negotiatorInfo.name, utilityInfo);
      } else {
        prom = Promise.resolve(null);
      }
      proms.push(prom);
    });

    let values = await Promise.all(proms);

    logExpression("Promise all results: ", 2);
    logExpression(values, 2);

    res.json(values);

    roundInfo.warmUpTimer = wait(1000 * durations.warmUp);
    await roundInfo.warmUpTimer.promise;
    logExpression("warmUpTimer has expired.", 2);
    let startRoundMessage = {
      roundId,
      roundDuration: durations.round,
      timestamp: new Date()
    };
    sendMessages(startRound, startRoundMessage, negotiatorIDs);

    roundInfo.roundTimer = wait(1000 * durations.round);
    await roundInfo.roundTimer.promise;
    logExpression("roundTimer has expired.", 2);
    let endRoundMessage = {
      roundId,
      timestamp: new Date()
    };
    sendMessages(endRound, endRoundMessage, negotiatorIDs);

    roundInfo.postRoundTimer = wait(1000 * durations.post);
    await roundInfo.postRoundTimer.promise;

    logExpression("postRoundTimer has expired.", 2);

    const roundTotals = await summarizeResults(roundInfo);

    let roundTotalsMessage = {
      roundId,
      roundTotals
    };
    logExpression("I am sending this results message to the human negotiator IDs: ", 2);
    logExpression(roundTotalsMessage, 2);
    logExpression(humanNegotiatorIDs, 2);
    sendMessages(totalRound, roundTotalsMessage, humanNegotiatorIDs);
  }
  catch (err) {
    res.json(err);
  }
});

app.post('/endRound', async (req, res) => {
  if(!req.body) {
    return res.json({"msg": "No POST body provided."});
  }
  
  roundId = req.body.roundId
  roundInfo = rounds[roundId];
  
  for (item in roundInfo){
    if (item.promise) {
      item.cancel();
    }
  }

  // end round for both agents
  let endRoundMessage = {
    roundId,
    timestamp: new Date()
  };

  let negotiatorIDs = roundInfo.agents.map(nBlock => nBlock.name);
  sendMessages(endRound, endRoundMessage, negotiatorIDs);

  res.json({body: 'Acknowledged'});
});

http.createServer(app).listen(app.get('port'), () => {
  logExpression(`Express server listening on port ${app.get('port')}`, 1);
});


function checkMessage(msg) {
  return msg.text && msg.text.length &&
    msg.speaker && msg.speaker.length &&
    (msg.role == 'buyer' || msg.role == 'seller');
}

function queueMessage(queue, message) {
  logExpression("In queueMessage, message is: ", 3);
  logExpression(message, 3);
  let msg = JSON.parse(JSON.stringify(message));
  queue.push({
    msg,
    timeStamp: new Date()
  });
  logExpression("------CHECK QUEUE-----", 2);
  logExpression(queue, 2);
  logExpression("----------------------", 2);
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

function sendLog(message, negotiatorID) {
  logExpression("In sendLog, sending message: ", 2);
  logExpression(message, 2);
  logExpression("To the recipient: ", 2);
  logExpression(negotiatorID, 2);
  return postDataToServiceType(message, negotiatorID, '/receiveLog');
}

function sendConfirmAccept(message, negotiatorID) {
  logExpression("In sendMessage, sending message: ", 2);
  logExpression(message, 2);
  logExpression("To the recipient: ", 2);
  logExpression(negotiatorID, 2);
  return postDataToServiceType(message, negotiatorID, '/confirmAccept');
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

function updateTotals(roundInfo, message) {
  let agents = [message.speaker, message.addressee];
  if(!roundInfo.totals) {
    roundInfo.totals = {};
  }

  agents.forEach(agent => {
    if(!roundInfo.totals[agent]) {
      roundInfo.totals[agent] = {
        price: 0.0,
        quantity:{}
      };
    }
    let bundlePrice =  get(message, ['bid', 'price', 'value'], 0.0);
    if(agent == 'Human') {
      roundInfo.humanBudget.value -= bundlePrice;
    }
    roundInfo.totals[agent].price += bundlePrice;
    Object.keys(message.bid.quantity).forEach(good => {
      if(!roundInfo.totals[agent].quantity[good]) {
        roundInfo.totals[agent].quantity[good] = 0;
      }
      roundInfo.totals[agent].quantity[good] += get(message, ['bid', 'quantity', good], 0);
    });
  });
  logExpression("Round totals updated to: ", 2);
  logExpression(roundInfo.totals, 2);
}

function summarizeResults(roundInfo) {
  logExpression("Just got inside summarizeResults.", 2);
  let summary = {};
  let proms = [];
  roundInfo.negotiatorsInfo.forEach(negotiatorInfo => {
    logExpression("negotiatorInfo is: ", 2);
    logExpression(negotiatorInfo, 2);
    let agentName = negotiatorInfo.name;
    if (["chat-ui", "human-ui", "competition-ui"].includes(agentName)) agentName = "Human"; // HACK !! We need to differentiate between name of UI and name of user of the UI
    if(roundInfo.totals[agentName] && !summary[agentName]) { // Don't duplicate utility information for e.g. chatUI and humanUI, which both serve the same human
      summary[agentName] = {
        quantity: roundInfo.totals[agentName].quantity
      };
      let utilityInfo = negotiatorInfo.utilityFunction;
      if(negotiatorInfo.role == 'seller') {
        logExpression("Seller!", 2);
        summary[agentName].revenue = roundInfo.totals[agentName].price;
        utilityInfo.bundle = JSON.parse(JSON.stringify(roundInfo.totals[agentName]));
      }
      else if (negotiatorInfo.role == 'buyer') {
        logExpression("Buyer!", 2);
        summary[agentName].cost = roundInfo.totals[agentName].price;
        utilityInfo.bundle = {
          cost: JSON.parse(JSON.stringify(roundInfo.totals[agentName])).price,
          products: JSON.parse(JSON.stringify(roundInfo.totals[agentName])).allocation || {}
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
  let serviceMap = rounds[json.roundId].serviceMap;
  if (!serviceMap[serviceID]) {
    throw new Error(`Invalid service: ${serviceID}`);
  }

  let options = serviceMap[serviceID];
  options.path = path;
  let url = optionsToUrl(options);
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
