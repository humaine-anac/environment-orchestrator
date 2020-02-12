const envLoaded = require('dotenv').load({silent: true});
if (!envLoaded) console.log('warning:', __filename, '.env cannot be found');

const appSettings = require('./appSettings.json');
const http = require('http');
// const { promisify } = require('util');
const express = require('express');
const path = require('path');
const uuidv1 = require('uuid/v1');
const { logExpression, setLogLevel } = require('@cel/logger');
const dc = require('@cel/discover');

let myPort = appSettings.defaultPort || 14010;
let logLevel = 1;

const roundWarmupDuration = appSettings.roundWarmupDuration || 5;
const roundDuration = appSettings.roundDuration || 120;

process.argv.forEach((val, index, array) => {
  if (val === '-port') {
    myPort = array[index + 1];
  }
  if (val === '-level') {
    logLevel = array[index + 1];
    logExpression('Setting log level to ' + logLevel, 1);
  }
});

setLogLevel(logLevel);

const app = express();

app.configure(() => {
  app.set('port', process.env.PORT || myPort);
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'jade');
  app.use(express.favicon());
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', () => {
  app.use(express.errorHandler());
});

// TBD Replace this -- actually change generateUtility service from GET to POST, so this won't be needed
// const getDataFromServiceType = promisify(dc().getDataFromServiceType);

//const postDataToServiceType = promisify(postDataToServiceTypeNew);

const wrapper = promise => (
  promise
    .then(data => ({ data, error: null }))
    .catch(error => ({ error, data: null }))
);

const getSafe = (p, o, d) =>
  p.reduce((xs, x) => (xs && xs[x] != null && xs[x] != undefined) ? xs[x] : d, o);
  
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

let environmentUUID = uuidv1();
let queue = [];

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
      
    let negotiators = appSettings.negotiatorInfo;
    let negotiatorIDs = negotiators.map(nBlock => {return nBlock.id;});

    if(allowMessage(message)) {
      queueMessage(message);    
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
      let sender = negotiators.filter(nBlock => {return nBlock.name == message.speaker;})[0].id;
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
    let negotiators = appSettings.negotiatorInfo;
    let negotiatorIDs = negotiators.map(nBlock => {return nBlock.id;});
    
    if(allowMessage(message)) {
      queueMessage(message);
      if(message.bid) delete message.bid; // Don't let other agents see the bid itself.
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
      let sender = negotiators.filter(nBlock => {return nBlock.name == message.speaker;})[0].id;
      sendRejection(message, sender);
    }
  }
  else {
    res.send(500, {"msg": "No message supplied."});
  }
});

app.get('/viewQueue', (req, res) => {
  res.json(queue);
});


//TBD This function should take the queue into account.
function allowMessage(message) {
  return true;
}

function queueMessage(message) {
  logExpression("In queueMessage, message is: ", 2);
  logExpression(message, 2);
  let msg = JSON.parse(JSON.stringify(message));
  queue.push({
    msg,
    timeStamp: new Date()
  });
  return;
}

app.get('/startRound', (req, res) => {
  logExpression("Inside startRound (GET).", 2);

  let round = req.query.round || 0;
  
  let environmentUUID = appSettings.environmentUUID || 'abcdefgh';
  
  let negotiators = appSettings.negotiatorInfo;
  negotiators = negotiators.map(nBlock => {nBlock.environmentUUID = environmentUUID; return nBlock;});
  let negotiatorIDs = negotiators.map(nBlock => {return nBlock.id;});

  initializeUtilities(negotiators)
  .then(agentResponses => {
    res.json(agentResponses);
    wait(1000 * roundWarmupDuration)
    .then(() => {
      let startRoundMessage = {
        roundDuration: roundDuration,
        roundNumber: round,
        timestamp: new Date()
      };
      sendMessages(startRound, startRoundMessage, negotiatorIDs);
    })
    .then(() => {
      wait(1000 * roundDuration)
      .then(() => {
        let endRoundMessage = {
          roundNumber: round,
          timestamp: new Date()
        };
        sendMessages(endRound, endRoundMessage, negotiatorIDs);
      });
    });
  })
  .catch(err => {
    res.json(err);
  });
});

http.createServer(app).listen(app.get('port'), () => {
  logExpression('Express server listening on port ' + app.get('port'), 2);
  dc().init({port: myPort});
  dc().installExpressRoutes(app);
});

function initializeUtilities(negotiators) {
  let proms = [];
  negotiators.forEach(negotiatorInfo => {
    let prom = getUtilityInfo(negotiatorInfo)
    .then(utilityInfo => {
      utilityInfo.name = negotiatorInfo.name;
      logExpression("For negotiator " + negotiatorInfo.id + ", utility is: ", 2);
      logExpression(utilityInfo, 2);
      return sendUtilityInfo(negotiatorInfo, utilityInfo)
      .then(response => {
        logExpression("Received response from utility message sent to " + negotiatorInfo.id, 2);
        logExpression(response, 2);
        return response;
      })
      .catch(e => {
        logExpression("Encountered error: ", 2);
        logExpression(e, 2);
      });
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

async function getUtilityInfo(negotiatorInfo) {
  logExpression("In getUtilityInfo, contacting agent specified by: ", 2);
  logExpression(negotiatorInfo, 2);
  try {
    const { error, data } = await wrapper(
      getDataFromServiceType('utility-generator', '/generateUtility/' + negotiatorInfo.type)
    );
    if(!error && data) {
      return data;
    }
  }
  catch(error) {
    logExpression("Got error!", 1);
    logExpression(error, 1);
    return Promise.reject(error);
  } 
}

// Send utility information to specified agent
async function sendUtilityInfo(negotiatorInfo, utilityInfo) {
  logExpression("In sendUtilityInformation, sending utility information: ", 2);
  logExpression(utilityInfo, 2);
  try {
    const { error, data } = await wrapper(
      postDataToServiceType(utilityInfo, negotiatorInfo.id, '/setUtility')
    );
    if(!error && data) {
      return data;
    }
  }
  catch(error) {
    logExpression("Got error!", 1);
    logExpression(error, 1);
    return Promise.reject(error);
  }
}

async function sendMessage(message, negotiatorID) {
  logExpression("In sendMessage, sending message: ", 2);
  logExpression(message, 2);
  logExpression("To the recipient: ", 2);
  logExpression(negotiatorID, 2);
  try {
    const { error, data } = await wrapper(
      postDataToServiceType(message, negotiatorID, '/receiveMessage')
    );
    if(!error && data) {
      return data;
    }
  }
  catch(error) {
    logExpression("Got error!", 1);
    logExpression(error, 1);
    return Promise.reject(error);
  }
}

async function sendRejection(message, negotiatorID) {
  logExpression("In sendRejection, sending message: ", 2);
  logExpression(message, 2);
  logExpression("To the recipient: ", 2);
  logExpression(negotiatorID, 2);
  try {
    const { error, data } = await wrapper(
      postDataToServiceType(message, negotiatorID, '/receiveRejection')
    );
    if(!error && data) {
      return data;
    }
  }
  catch(error) {
    logExpression("Got error!", 1);
    logExpression(error, 1);
    return Promise.reject(error);
  }
}

async function startRound(message, negotiatorID) {
  logExpression("In startRound, sending message: ", 2);
  logExpression(message, 2);
  logExpression("To the recipient: ", 2);
  logExpression(negotiatorID, 2);
  try {
    const { error, data } = await wrapper(
      postDataToServiceType(message, negotiatorID, '/startRound')
    );
    if(!error && data) {
      return data;
    }
  }
  catch(error) {
    logExpression("Got error!", 1);
    logExpression(error, 1);
    return Promise.reject(error);
  }
}

async function endRound(message, negotiatorID) {
  logExpression("In endRound, sending message: ", 2);
  logExpression(message, 2);
  logExpression("To the recipient: ", 2);
  logExpression(negotiatorID, 2);
  try {
    const { error, data } = await wrapper(
      postDataToServiceType(message, negotiatorID, '/endRound')
    );
    if(!error && data) {
      return data;
    }
  }
  catch(error) {
    logExpression("Got error!", 1);
    logExpression(error, 1);
    return Promise.reject(error);
  }
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

let request = require('request');
function postDataToServiceType(json, serviceType, path) {
  let serviceMap = appSettings.serviceMap;
  if(serviceMap[serviceType]) {
    let options = serviceMap[serviceType];
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
    });
  }
}

function getDataFromServiceType(json, serviceType, path) {
  let serviceMap = appSettings.serviceMap;
  if(serviceMap[serviceType]) {
    let options = serviceMap[serviceType];
    options.path = path;
    let url = options2URL(options);
    let rOptions = {
      method: 'GET',
      uri: url
    };
    return request(rOptions)
    .then(response => {
      return response;
    })
    .catch(error => {
      logExpression("Error: ", 1);
      logExpression(error, 1);
    });
  }
}

//function options2URL(options) {
//  let protocol = options.protocol || 'http';
//  let url = protocol + '://' + options.host;
//  if (options.port) url += ':' + options.port;
//  if (options.path) url  += options.path;
//  return url;
//}
//
//function applyGate(agentResponses) {
//  logExpression("In applyGate, agentResponses are: ", 2);
//  logExpression(agentResponses, 2);
//  let agentResponsesFiltered = agentResponses.filter(response => {
//    logExpression("Processing ", 2);
//    logExpression(response, 2);
//    return (response && response.response && response.response.metadata && response.response.metadata.role == 'seller');
//  });
//  logExpression("Filtered responses: ", 2);
//  logExpression(agentResponsesFiltered, 2);
//  return agentResponsesFiltered;
//}