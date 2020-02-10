# anac-environment-orchestrator
The ANAC environment orchestrator is a central component of the HUMAINE negotiation platform. It communicates with the negotiating agents, the human market administrator, and UIs associated with the human negotiator.

How to install the Environment Orchestrator
----

```sh
git clone git@us-south.git.cloud.ibm.com:anac-negotiation/anac-environment-orchestrator.git
cd anac-environment-orchestrator
cp assistantParams.json.template assistantParams.json
cp cog.json.template cog.json
```
Edit the file assistantParams.json to include the correct apikey, url, and assistantId for the Watson Assistant skill.

Edit the `watcher` and `host` lines in the file cog.json to reflect the name of the host on which your code is installed.

```sh
npm install
crun load
```

Now you should have a running instance of the environment orchestrator.

How to test the negotiation platform
----

In addition to the environment orchestrator, you need at the very minimum
- Two instances of a negotiation agent (see the repository `anac-agent-jok`)
- The utility generator (see the repository `anac-utility`)

Here are brief instructions for testing:
- Start two instances of the agent (see the README in repository `anac-agent-jok` for detailed installation
- Start the utility generator (see the README in repository `anac-utility` for detailed instructions)

Now you should be able to test some of the functions; here are some example URLs
that you can test (in this order):

- To start a round: `<host>:14010/startRound?round=1`

- To simulate a human speaking: `<host>:14010/sendOffer?text=%22Hey%20Watson%20I%20will%20give%20you%204.75%20for%202%20eggs,%201%20cup%20of%20chocolate,%201%20packet%20of%20blueberries,%20and%208%20cups%20of%20milk.%20Also%203%20loaves%20of%20bread.%22`

- To view the queue of messages received by the environment orchestrator: `<host>:14010/viewQueue`

Note that there is some delay between when you ask for a round to start and the actual start of the round; this delay is set in appSettings.json (roundWarmupDelay). So a bid will not be valid until the round actually starts. The default value is 5 seconds; we may want to set it to 30 seconds in the actual competition to give humans time to think about their negotiation strategy. 