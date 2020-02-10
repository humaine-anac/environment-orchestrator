# ANAC-environment-orchestrator

Brief installation instructions

Clone this code to a directory, copy the *.json.template files to *.json, and
configure the *.json files appropriately.

Run `npm install` and then `crun load`.

Now you should have a running instance of the environment orchestrator.

Start two instances of the agent.

Now you should be able to test some of the functions; here are some example URLs
that you can test:

To start a round: `<host>:14010/startRound?round=1`

To simulate a human speaking: `<host>:14010/sendOffer?text=%22Hey%20Watson%20I%20will%20give%20you%204.75%20for%202%20eggs,%201%20cup%20of%20chocolate,%201%20packet%20of%20blueberries,%20and%208%20cups%20of%20milk.%20Also%203%20loaves%20of%20bread.%22`

To view the queue of messages received by the environment orchestrator: `<host>:14010/viewQueue`

Note that there is some delay between when you ask for a round to start and the actual start of the round;
this delay is set in appSettings.json (roundWarmupDelay). So a bid will not be valid until the round actually starts.
The default value is 5 seconds; we want to set it to 30 seconds in the actual competition to give humans time to 
think about their negotiation strategy.
