const fs = require('fs');
const {allowMessage} = require('../enforce-rules');
const appSettings = require('../appSettings.json');

queue = [];
errorMsgs = [];
msgs = [];
let responseTimeLimit = appSettings.responseTimeLimit || 4000;
let canTalkAtOnce = appSettings.canTalkAtOnce;

function queueMessage(message) {
  let msg = JSON.parse(JSON.stringify(message));
  let now = new Date()
  if (message.now){
    now = new Date(message.now)
  }
  queue.push({
    msg,
    timeStamp: now
  });

  return;
}

function setAddressee(utterance){

  const lower_transcript = utterance.toLowerCase();
  let addressee = null;

  if (lower_transcript.startsWith('a1') || lower_transcript.startsWith('@a1')) {
    addressee = 'A1';
  }
  else if (lower_transcript.startsWith('a2') || lower_transcript.startsWith('@a2')) {
    addressee = 'A2';
  }
  else {
    addressee = '';
  }
  return addressee;

}

try {
    // read contents of the file
    const data = fs.readFileSync('data/humaine_testing_dialog.txt', 'UTF-8');

    // split the contents by new line
    const lines = data.split(/\r?\n/);
    messages = []

    // print all lines
    for (var n = 0; n < lines.length; n++) {
        message = {};
        line = lines[n];
        line = line.replace(/(\r\n|\n|\r)/gm, "");
        if (line!="undefined" && line.length>0) {
          fields = line.split(';');
          time_units = fields[0].split(":");
          //01 Jan 2020
          message_timestamp = new Date(2020, 0, 1, time_units[0], time_units[1], time_units[2], time_units[3]);
          message.now = message_timestamp.getTime();
          if (fields[1].toLowerCase()=="h") {
            message.speaker = "Human";
          }
          else {
            message.speaker = fields[1];
          }
          message.addressee = setAddressee(fields[2]);
          message.text = fields[2];
          console.log("------------------------message------------------------------")
          console.log(message)
          console.log("-------------------------------------------------------------")
          // let permission = allowMessage(message, 50000, queue);
          let permission = allowMessage(message, 50000, queue, responseTimeLimit, canTalkAtOnce);


          if ((permission.permit==true && fields[3]=="accepted")||(permission.permit==false && fields[3]=="blocked")){
            console.log("test ok")
          }
          else {
            console.log("test failed");
            console.log("Check test file. Test did not pass for utterance: " + message.text);
            console.log("Got permission " + permission.permit);
            console.log("And was expected: " + (fields[3]=="accepted"?true:false));
            error = "message[" + n + "]|speaker:"+ message.speaker + "|text:"+  message.text + "|expected:" + fields[3] + "|permisson:" + permission.permit + "|rationale:" + permission.rationale;
            errorMsgs.push(error);

            // break;
          }

          msg = "message[" + n + "]|speaker:"+ message.speaker + "|text:"+  message.text + "|expected:" + fields[3] + "|permisson:" + permission.permit + "|rationale:" + permission.rationale;
          msgs.push(msg);


          if(permission.permit) {
            queueMessage(message); // Only queue message that has been permitted
          }

        }

    }

    if (errorMsgs.length>0) {
      console.log("---------------Errors--------------------")
      for (var i = 0; i < errorMsgs.length; i++) {
        console.log(errorMsgs[i]);
      }
    }

    if (msgs.length>0) {
      console.log("---------------Msgs--------------------")
      for (var i = 0; i < msgs.length; i++) {
        console.log(msgs[i]);
      }
    }

    // lines.forEach((line) => {
    //     message = {};
    //     line = line.replace(/(\r\n|\n|\r)/gm, "");
    //     console.log("-------------------------------------------------------------")
    //     console.log(line)
    //     if (line!="undefined" && line.length>0) {
    //       fields = line.split(';');
    //       time_units = fields[0].split(":");
    //       console.log("------------time fields-------------------------------")
    //       console.log(time_units)
    //       //01 Jan 2020
    //       message_timestamp = new Date(2020, 0, 1, time_units[0], time_units[1], time_units[2], time_units[3]);
    //       message.now = message_timestamp.getTime();
    //       if (fields[1].toLowerCase()=="h") {
    //         message.speaker = "Human";
    //       }
    //       else {
    //         message.speaker = fields[1];
    //       }
    //       message.addressee = setAddressee(fields[2]);
    //       message.text = fields[2];
    //       console.log(message)
    //       console.log("-------------------------------------------------------------")
    //       let permission = allowMessage(message, 50000, queue);
    //
    //       if (permission.permit==true && fields[3]=="accepted"){
    //         console.log("Passou")
    //       }
    //       else if (permission.permit==false && fields[3]=="blocked"){
    //         console.log("Passou")
    //       }
    //       else {
    //         console.log("Não Passou");
    //       }
    //
    //       if(permission.permit) {
    //         queueMessage(message); // Only queue message that has been permitted
    //       }
    //
    //     }
    //
    // });
} catch (err) {
    console.error(err);
}
