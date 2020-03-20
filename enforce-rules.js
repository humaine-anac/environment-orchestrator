const {setLogLevel, logExpression} = require('@cisl/zepto-logger');
// logExpression is like console.log, but it also
//   * outputs a timestamp
//   * first argument takes text or JSON and handles it appropriately
//   * second numeric argument establishes the logging priority: 1: high, 2: moderate, 3: low
//   * logging priority n is set by -level n option on command line when agent-jok is started

let logLevel = 2; // default log level
setLogLevel(logLevel);

const getSafe = (p, o, d) =>
  p.reduce((xs, x) => (xs && xs[x] != null && xs[x] != undefined) ? xs[x] : d, o);


function isSpeakerBot(message) {
   if(message.speaker == "Human") return false;
   else return true;
}

function rule0Evaluation(message, queue) {
   logExpression("In rule0 with message and queue: ", 2);
   logExpression(message, 2);
   logExpression(queue, 2);
   let permit = true;
   let rationale = null;
   let messageSpeaker = getSafe(['speaker'], message, null);
   logExpression("messageSpeaker: " + messageSpeaker, 2);
   if(messageSpeaker == "Human" && queue && queue.length) {
      let hQueue = queue.filter(mBlock => {
         return mBlock.msg.speaker == "Human";
      });
      if(hQueue && hQueue.length) {
         let lastHumanUtteranceTime = hQueue[hQueue.length-1].timeStamp;
         let now = new Date();
         let tDiff = now.getTime() - lastHumanUtteranceTime.getTime();
         logExpression("tDiff = " + tDiff, 2);
         if(tDiff < 5000) {
            permit = false;
            rationale = "Recent human utterance.";
         }
      }
   }
   logExpression("Returning from rule0 with evaluation: ", 2);
   logExpression({permit, rationale}, 2);
   return {permit, rationale};
}

function rule1Evaluation(message, humanBudget) {
   let permit = true;
   let rationale = null;
   let messageType = getSafe(['bid', 'type'], message, null);
   if (messageType == 'Accept') {
      let bidAmount = getSafe(['bid', 'price', 'value'], message, 0.0);
      logExpression("In allowMessage, bidAmount is " + bidAmount + ", compared with human budget of " + humanBudget, 2);
      if(bidAmount > humanBudget) {
         permit = false;
         rationale = "Insufficient budget";
      }
   }
   return {permit, rationale};
}

//TBD
function rule2Evaluation(message, queue) {
   let permit = true;
   let rationale = null;
   return {permit, rationale};
}

//TBD
function rule3Evaluation(message, queue) {
   let permit = true;
   let rationale = null;
   return {permit, rationale};
}

function rule4Evaluation(message) {
   let permit = true;
   let rationale = null;
   let messageText = getSafe(['text'], message, "");
   let words = messageText.split(' ');
   if(words.length > 100) {
      permit = false;
      rationale = "Excessive message length";
   }
   return {permit, rationale};
}

// Decide whether to allow or block a message (and in the latter case provide a rationale)
function allowMessage(message, humanBudget, queue) {

  let permit = true;
  let rationale = null;

  logExpression("queue is: ", 2);
  logExpression(queue, 2);
  
  let rules = [];
  rules[0] = rule0Evaluation(message, queue);
  rules[1] = rule1Evaluation(message, humanBudget);
  rules[2] = rule2Evaluation(message, queue);
  rules[3] = rule3Evaluation(message, queue);
  rules[4] = rule4Evaluation(message);
  
  rules.forEach(rule => {
   permit = permit && rule.permit;
   if(!rule.permit) {
      if(!rationale) rationale = "";
      else {
         rationale += ", ";
      }
      rationale += rule.rationale;
   }
  });
  
/*
  if (permit){
    //R1: If the speaker is not a agent(bot) it will be allowed.
    if (!(message.bot)){
      permit = true;
    }
    else{
      //R2: When the message contains a direct address, if the message speaker is the mentioned agent,
      //then the speaker will be allowed, otherwise the speaker will be blocked.
      if (message.inReplyTo){
        if (message.inReplyTo.addressee && message.inReplyTo.addressee!=undefined){
          if (message.inReplyTo.addressee==message.speaker){
            permit = true;
            d1 = new Date(message.inReplyTo.timeStamp);
            d2 = new Date(message.timeStamp);
            var diffInMillis = d2.getTime() - d1.getTime();
            if (diffInMillis>2000) {
              permit = false;
              message.expired = true;
            }
          }
          else {
            permit = false;
            turn = message.inReplyTo.turnID;
            for (i = (queue.length-1); i>=0 ; i--) {
              if (queue[i].msg.inReplyTo && queue[i].msg.inReplyTo.turnID==turn){
                if((queue[i].msg.speaker==queue[i].msg.inReplyTo.addressee) && queue[i].msg.expired){
                  permit = true;
                  break;
                }
              }
            }
          }
        }
        else {
          permit = true;
        }

        if (permit) {
          // tmpQueue = [];
          permitedQueue = [];
          qtMessagesinTurn = 0;

          turn = message.inReplyTo.turnID;

          for (i = 0; i<=(queue.length-1) ; i++) {
            if (queue[i].msg.permit){
              permitedQueue.push(queue[i]);
            }
          }

          // for (i = (queue.length-1); i>=0 ; i--) {
          //   if ((queue[i].msg.turnID==turn) || (queue[i].msg.inReplyTo && queue[i].msg.inReplyTo.turnID==turn)){
          //     tmpQueue.push(queue[i]);
          //   }
          // }

          for (i = (permitedQueue.length-1); i>=0 ; i--) {
            if ((permitedQueue[i].msg.turnID==turn) || (permitedQueue[i].msg.inReplyTo && permitedQueue[i].msg.inReplyTo.turnID==turn)){
              // tmpQueue.push(queue[i]);
              qtMessagesinTurn++;
            }
          }

          // if (tmpQueue.length==3){
          if (qtMessagesinTurn==3){
            permit = false;
          }
          else {
            if(permitedQueue.length>1 && permitedQueue[permitedQueue.length-1].msg.bot && permitedQueue[permitedQueue.length-2].msg.bot){
              permit = false;
            }
            else {
              permit = true;
            }
          }
        }
      }
    }
  }

  if(permit){
    currentTurnID++;
    message.turnID = currentTurnID;
  }
  message.permit = permit; */
  return {permit, rationale};
}

// Export these functions
exports = module.exports = {
  allowMessage
};