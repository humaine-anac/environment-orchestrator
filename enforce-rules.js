const {logExpression} = require('@cisl/zepto-logger');
const {get} = require('lodash');

// logExpression is like console.log, but it also
//   * outputs a timestamp
//   * first argument takes text or JSON and handles it appropriately
//   * second numeric argument establishes the logging priority: 1: high, 2: moderate, 3: low
//   * logging priority n is set by --level n option on command line when agent-jok is started

function isSpeakerBot(message) {
  return message.speaker !== "Human";
}

function rule0Evaluation(message, queue) {
   logExpression("In rule0 with message and queue: ", 2);
   logExpression(message, 2);
   logExpression(queue, 2);

   let permit = true;
   let rationale = null;
   let messageSpeaker = get(message, ['speaker'], null);
   logExpression("messageSpeaker: " + messageSpeaker, 2);
   if(messageSpeaker == "Human" && queue && queue.length) {
      let hQueue = queue.filter(mBlock => {
         return mBlock.msg.speaker == "Human";
      });
      let aQueue = queue.filter(mBlock => {
         return ['Watson', 'Celia'].includes(mBlock.msg.speaker);
      });

      if(hQueue && hQueue.length) {
         let lastHumanUtteranceTime = hQueue[hQueue.length-1].timeStamp;
         let now = new Date();
         if (message.now){
           now = new Date(message.now)
         }
         let tDiff = now.getTime() - lastHumanUtteranceTime.getTime();
         logExpression("tDiff = " + tDiff, 2);

         let lastAgentUtteranceTime;
         let tDiffAgent = tDiff;
         if(aQueue && aQueue.length) {
            lastAgentUtteranceTime = aQueue[aQueue.length-1].timeStamp;
            tDiffAgent = now.getTime() - lastAgentUtteranceTime.getTime();
            logExpression("tDiffAgent = " + tDiffAgent, 2);
         }

         if(tDiff < 0.5 && tDiffAgent >= tDiff) {
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

  logExpression("In rule1 with message: ", 2);
  logExpression(message, 2);

   let permit = true;
   let rationale = null;
   let messageType = get(message, ['bid', 'type'], null);
   if (messageType == 'Accept') {
      let bidAmount = get(message, ['bid', 'price', 'value'], 0.0);
      logExpression("In allowMessage, bidAmount is " + bidAmount + ", compared with human budget of " + humanBudget, 2);
      if(bidAmount > humanBudget) {
         permit = false;
         rationale = "Insufficient budget";
      }
   }
   logExpression("Returning from rule1 with evaluation: ", 2);
   logExpression({permit, rationale}, 2);
   return {permit, rationale};
}

//TBD
function rule2Evaluation(message, queue, responseTimeLimit, canTalkAtOnce) {

  //R2: If an agent is addressed, it has the first right to respond.
  //It must do so within two seconds;
  //otherwise the unaddressed agent will be granted the right to respond and
  //the addressed agent will be prohibited from responding until the next human utterance.

  logExpression("In rule2 with message and queue: ", 2);
  logExpression(message, 2);
  logExpression(queue, 2);

  let permit = true;
  let rationale = null;
  let lastHumanUtterance = {};

  if(queue && queue.length) {
     let hQueue = queue.filter(mBlock => {
       return mBlock.msg.speaker == "Human";
     });
     if(hQueue && hQueue.length) {
       lastHumanUtterance = hQueue[hQueue.length-1];
     }
  }

  if (isSpeakerBot(message)){

    if (lastHumanUtterance.msg.addressee &&
      (lastHumanUtterance.msg.addressee!=undefined && lastHumanUtterance.msg.addressee!="")) {

      let now = new Date();
      if (message.now){
        now = new Date(message.now)
      }
      lastHumanUtteranceTime = new Date(lastHumanUtterance.timeStamp);
      let tDiff = now.getTime() - lastHumanUtteranceTime.getTime();
      logExpression("tDiff = " + tDiff, 2);
      logExpression("lastHumanUtterance.msg.addressee " + lastHumanUtterance.msg.addressee, 2);
      logExpression("message.speaker " + message.speaker, 2);

      if (lastHumanUtterance.msg.addressee!=message.speaker && tDiff>2000){
        logExpression("case 1", 2);

        permit = true;
        rationale = null;

      }
      else
      if (lastHumanUtterance.msg.addressee!=message.speaker && tDiff<=2000){

        logExpression("case 2", 2);

        permit = false;
        rationale = "Premature response from unaddressed agent";

      }
      else
      // if (lastHumanUtterance.msg.addressee==message.speaker && tDiff>2000){
      if (lastHumanUtterance.msg.addressee==message.speaker && tDiff>responseTimeLimit){

        logExpression("case 3", 2);

        permit = false;
        rationale = "Addressee message delayed";

      }
      else
      // if (lastHumanUtterance.msg.addressee==message.speaker && tDiff<=2000){
      if (lastHumanUtterance.msg.addressee==message.speaker && tDiff<=responseTimeLimit){

        logExpression("case 4", 2);

        permit = true;
        rationale = null;

        let lastMemberUtterance = queue[queue.length-1];

        if (isSpeakerBot(lastMemberUtterance.msg)){
          // if the non-addressed agent responds, any response then from the addressed agent should be blocked,
          //to retain the idea that the non-addressed agent can "steal" a reply round.
          if (lastMemberUtterance.msg.speaker!=message.speaker){

            logExpression("case 5", 2);

            permit = false;
            rationale = "The unaddressed agent just replied the sentence."
          }

        }


      }

     }
     else {

       let lastMemberUtterance = queue[queue.length-1];

       if (isSpeakerBot(lastMemberUtterance.msg)){

         //Fixing. There is no restriction on "agents speaking on top of each other", if flag canTalkAtOnce is true.
         if (!canTalkAtOnce){

           let now = new Date();
           if (message.now){
             now = new Date(message.now)
           }
           lastMemberUtteranceTime = new Date(lastMemberUtterance.timeStamp);
           let tDiff = now.getTime() - lastMemberUtteranceTime.getTime();
           logExpression("case 5", 2);
           logExpression("now = " + now.getTime(), 2);
           logExpression("lastMemberUtteranceTime = " + lastMemberUtteranceTime.getTime(), 2);
           logExpression("tDiff = " + tDiff, 2);

           if (tDiff<30){
             permit = false;
             rationale = "Agents speaking at same time";
           }

         }

       }

     }

   }
   logExpression("Returning from rule2 with evaluation: ", 2);
   logExpression({permit, rationale}, 2);
   return {permit, rationale};
}

//TBD
function rule3Evaluation(message, queue) {

  //R3: Each agent may speak at most once after the most recent human utterance.
  //For example, the sequence [H, A1, A2, H, A2, A1] is valid,
  //but the sequence [H, A1, A2, A1] is not because A1 has spoken twice after the most recent human utterance.
  //If both agents reply at the same time, or in other words,
  //if the difference between the timestamps upon reception of the messages is within milliseconds,
  //the first response is granted, while the second is blocked.
  //The agent that had its message blocked can still reply to the human and
  //it could take into account the message of the other agent that has been allowed.

  logExpression("In rule3 with message and queue: ", 2);
  logExpression(message, 2);
  logExpression(queue, 2);

  let permit = true;
  let rationale = null;
  let lastHumanUtterance = {};

  if (isSpeakerBot(message)){

    if(queue && queue.length) {

      var n = queue.length;
      qt_msg_turn = 0;

      while (isSpeakerBot(queue[n-1].msg)) {
        qt_msg_turn++
        n--
      }

      if (qt_msg_turn==2) {
        permit = false;
        rationale = "Quantity of agents messages exceeded"
      }
      else {
        let lastMemberUtterance = queue[queue.length-1];
        if (lastMemberUtterance.msg.speaker==message.speaker){
          permit = false;
          rationale = "Agent speaking twice"
        }
      }
    }
  }

  logExpression("Returning from rule3 with evaluation: ", 2);
  logExpression({permit, rationale}, 2);

  return {permit, rationale};
}

function rule4Evaluation(message) {
   let permit = true;
   let rationale = null;
   let messageText = get(message, ['text'], "");
   let words = messageText.split(' ');
   if(words.length > 100) {
      permit = false;
      rationale = "Excessive message length";
   }
   logExpression("Returning from rule4 with evaluation: ", 2);
   logExpression({permit, rationale}, 2);
   return {permit, rationale};
}

// Decide whether to allow or block a message (and in the latter case provide a rationale)
function allowMessage(message, humanBudget, queue, responseTimeLimit, canTalkAtOnce) {

  let permit = true;
  let rationale = null;

  let rules = [];
  rules[0] = rule0Evaluation(message, queue);
  rules[1] = rule1Evaluation(message, humanBudget);
  rules[2] = rule2Evaluation(message, queue, responseTimeLimit, canTalkAtOnce);
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
  allowMessage,
  rule0Evaluation,
  rule1Evaluation,
  rule4Evaluation,
  isSpeakerBot
};
