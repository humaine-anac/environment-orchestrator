# anac-environment-orchestrator
The ANAC environment orchestrator is a central component of the HUMAINE negotiation platform. It communicates with the negotiating agents, the human market administrator, and UIs associated with the human negotiator.

How to install the Environment Orchestrator
----

```sh
git clone git@us-south.git.cloud.ibm.com:anac-negotiation/anac-environment-orchestrator.git
cd anac-environment-orchestrator
```

```sh
npm install
node anac-environment-orchestrator.js -port 14010 -level 2 > eo001.log &
```

Now you should have a running instance of the environment orchestrator.

How to test the negotiation platform
----

For a detailed account of how to test the negotiation platform, see the README file for the `anac-agent-jok` service.


APIs
----


`/startRound (POST)`
-----

This API is called by a manager such as the chatUI or the anac-manager to cause the Environment Orchestrator to start a new round defined by the parameters in the POST body. Upon receiving this message, the EO sends utility information to each agent, along with the name the agent is to assume for that round and information about the round's duration and other timing parameters.

Note that there is some delay between when you ask for a round to start and the actual start of the round; this delay is set in appSettings.json (roundWarmupDelay), or in the POST body for the /startRound message. So a bid will not be valid until the round actually starts. The default value is 5 seconds; we may want to set it to 30 seconds in the actual competition to give humans time to think about their negotiation strategy. 

Here is an example POST body:

```
{
   "roundNumber":1,
   "agents":[
      {
         "protocol":"http",
         "host":"localhost",
         "port":"14007",
         "name":"Watson",
         "utilityFunction":{
            "currencyUnit":"USD",
            "utility":{
               "egg":{
                  "type":"unitcost",
                  "unit":"each",
                  "parameters":{
                     "unitcost":0.32
                  }
               },
               "flour":{
                  "type":"unitcost",
                  "unit":"cup",
                  "parameters":{
                     "unitcost":0.85
                  }
               },
               "sugar":{
                  "type":"unitcost",
                  "unit":"cup",
                  "parameters":{
                     "unitcost":0.71
                  }
               },
               "milk":{
                  "type":"unitcost",
                  "unit":"cup",
                  "parameters":{
                     "unitcost":0.35
                  }
               },
               "chocolate":{
                  "type":"unitcost",
                  "unit":"ounce",
                  "parameters":{
                     "unitcost":0.2
                  }
               },
               "blueberry":{
                  "type":"unitcost",
                  "unit":"packet",
                  "parameters":{
                     "unitcost":0.45
                  }
               },
               "vanilla":{
                  "type":"unitcost",
                  "unit":"teaspoon",
                  "parameters":{
                     "unitcost":0.27
                  }
               }
            }
         }
      },
      {
         "protocol":"http",
         "host":"localhost",
         "port":"14008",
         "name":"Celia",
         "utilityFunction":{
            "currencyUnit":"USD",
            "utility":{
               "egg":{
                  "type":"unitcost",
                  "unit":"each",
                  "parameters":{
                     "unitcost":0.43
                  }
               },
               "flour":{
                  "type":"unitcost",
                  "unit":"cup",
                  "parameters":{
                     "unitcost":0.7
                  }
               },
               "sugar":{
                  "type":"unitcost",
                  "unit":"cup",
                  "parameters":{
                     "unitcost":0.65
                  }
               },
               "milk":{
                  "type":"unitcost",
                  "unit":"cup",
                  "parameters":{
                     "unitcost":0.31
                  }
               },
               "chocolate":{
                  "type":"unitcost",
                  "unit":"ounce",
                  "parameters":{
                     "unitcost":0.29
                  }
               },
               "blueberry":{
                  "type":"unitcost",
                  "unit":"packet",
                  "parameters":{
                     "unitcost":0.45
                  }
               },
               "vanilla":{
                  "type":"unitcost",
                  "unit":"teaspoon",
                  "parameters":{
                     "unitcost":0.25
                  }
               }
            }
         }
      }
   ],
   "human":{
      "utilityFunction":{
         "currencyUnit":"USD",
         "utility":{
            "cake":{
               "type":"unitvaluePlusSupplement",
               "unit":"each",
               "parameters":{
                  "unitvalue":25.76,
                  "supplement":{
                     "chocolate":{
                        "type":"trapezoid",
                        "unit":"ounce",
                        "parameters":{
                           "minQuantity":3,
                           "maxQuantity":6,
                           "minValue":2.34,
                           "maxValue":7
                        }
                     },
                     "vanilla":{
                        "type":"trapezoid",
                        "unit":"teaspoon",
                        "parameters":{
                           "minQuantity":2,
                           "maxQuantity":4,
                           "minValue":2.77,
                           "maxValue":7.35
                        }
                     }
                  }
               }
            },
            "pancake":{
               "type":"unitvaluePlusSupplement",
               "unit":"each",
               "parameters":{
                  "unitvalue":25.73,
                  "supplement":{
                     "chocolate":{
                        "type":"trapezoid",
                        "unit":"ounce",
                        "parameters":{
                           "minQuantity":3,
                           "maxQuantity":6,
                           "minValue":3.98,
                           "maxValue":6.33
                        }
                     },
                     "blueberry":{
                        "type":"trapezoid",
                        "unit":"packet",
                        "parameters":{
                           "minQuantity":1,
                           "maxQuantity":3,
                           "minValue":2.16,
                           "maxValue":4.27
                        }
                     }
                  }
               }
            }
         }
      }
   },
   "durations":{
      "warmUp":5,
      "round":"300",
      "post":"60"
   }
}
```

The response to a message such as this is an acknowledgment consisting of an array of messages received from the various agents contacted by the environment orchestrator when it informs them that the round has started.


`/relayMessage (POST)`
-----

This API is called by agents or the chatUI to submit a proposed message. The EO considers the message and decides whether to permit it to be forwarded. It also updates various internal data structures such as the message queue and the round totals. If it is permitted, the message will be sent to the environment (or chat UI, in the test configuration), to the humanUI, and to the other agents. Otherwise, the `receiveRejection` API will be called on the agent who originally sent the message.

Here is an example POST body:

```
{
   "text":"How about if I sell you 1 blueberry for 0.69 USD.",
   "speaker":"Celia",
   "role":"seller",
   "addressee":"Human",
   "environmentUUID":"abcdefg",
   "timeStamp":"2020-02-23T02:22:39.152Z",
   "bid":{
      "quantity":{
         "blueberry":1
      },
      "type":"SellOffer",
      "price":{
         "unit":"USD",
         "value":0.69
      }
   }
}
```

The response is an acknowledgment plus an array of responses from the agents that receive the permitted message, or else a 500 error if something goes awry.

An example that corresponds with the POST body above, generated when a round is inactive, is:

```
{
    "status": "Acknowledged",
    "allResponses": [
        {
            "msgType": "submitTranscript",
            "Status": "OK"
        },
        {
            "status": "acknowledged"
        },
        {
            "status": "Failed; round not active"
        },
        {
            "status": "Failed; round not active"
        }
    ]
}
```

The first response in the array is from the chat UI, the second from the human UI, and the final two from the two agent instances.


`/sendOffer (GET)`
-----

This API provides a way to test the agent's ability to process text messages in stand-alone mode. It should not be used under ordinary circumstances.

Example:
``<host>:14010/sendOffer?text=%22Hey%20Watson%20I%20will%20give%20you%204.75%20for%202%20eggs,%201%20cup%20of%20chocolate,%201%20packet%20of%20blueberries,%20and%208%20cups%20of%20milk.%20Also%203%20loaves%20of%20bread.%22``

In ordinary practice, it is preferable to use `/relayMessage (POST)', as described above.


`/calculateUtility/:agentName (POST)`
-----

Calculates the utility for a given agent (specified by name in the URL path), given a bundle of goods and a price.

Example POST body sent to `<host>:<port>/calculateUtility/Watson`:

```
{
    "price": 20,
	"quantity": {
		"egg": 4,
		"milk": 2,
		"flour": 3,
		"blueberry": 5,
		"chocolate": 8
	}
}
```

Corresponding response:

```
{
    "currencyUnit": "USD",
    "value": 10.47
}
```

`/receiveHumanAllocation (POST)`
-----

Receives a message containing information about how the human has chosen to partition their purchased goods into produced goods (i.e. cakes and pancakes).

Example POST body:

```
{
    "cake":{
        "unit": "each",
        "quantity":3,
        "supplement":[
           {
              "chocolate":{
                 "unit":"ounce",
                 "quantity":2
              },
              "vanilla":{
                 "unit":"teaspoon",
                 "quantity":2
              }
           },
           {
              "chocolate":{
                 "unit":"ounce",
                 "quantity":3
              }
           },
           {
              "vanilla":{
                 "unit":"teaspoon",
                 "quantity":1
              }
           }
        ]
    },
    "pancake":{
        "unit": "each",
        "quantity":2,
        "supplement":[
           {
              "blueberry":{
                 "unit":"packet",
                 "quantity":2
              }
           },
           {
    
           }
        ]
    }
}
```

Responds with either 

```
{
    "status": "Acknowledged"
}
``` 

or 

```
{
    "status": "Failed", "Reason": "No body supplied."
}
``` 

`/viewQueue (GET)`
-----

This API is called with no parameters to obtain the current message queue. This would be a useful input to an algorithm like Ravel that decides whether to allow a message from an agent to be rendered in the environment and sent to the other agents.

Example response:

```
[
   {
      "msg":{
         "speaker":"Human",
         "addressee":"Watson",
         "text":"Watson I'll buy 1 egg, 2 cups of flour, 2 cups of milk for $4.20",
         "role":"buyer",
         "environmentUUID":"abcdefg",
         "timestamp":1582424529741
      },
      "timeStamp":"2020-02-23T02:22:09.744Z"
   },
   {
      "msg":{
         "text":"You've got it! I'll let you have 1 egg 2 flour 2 milk for 4.2 USD.",
         "speaker":"Watson",
         "role":"seller",
         "addressee":"Human",
         "environmentUUID":"abcdefg",
         "timeStamp":"2020-02-23T02:22:10.205Z",
         "bid":{
            "quantity":{
               "egg":1,
               "flour":2,
               "milk":2
            },
            "type":"Accept",
            "price":{
               "value":4.2,
               "unit":"USD"
            }
         }
      },
      "timeStamp":"2020-02-23T02:22:10.208Z"
   },
   {
      "msg":{
         "speaker":"Human",
         "addressee":"Celia",
         "text":"Celia I'll buy 1 packet of blueberries for $0.30",
         "role":"buyer",
         "environmentUUID":"abcdefg",
         "timestamp":1582424558816
      },
      "timeStamp":"2020-02-23T02:22:38.820Z"
   },
   {
      "msg":{
         "text":"How about if I sell you 1 blueberry for 0.69 USD.",
         "speaker":"Celia",
         "role":"seller",
         "addressee":"Human",
         "environmentUUID":"abcdefg",
         "timeStamp":"2020-02-23T02:22:39.152Z",
         "bid":{
            "quantity":{
               "blueberry":1
            },
            "type":"SellOffer",
            "price":{
               "unit":"USD",
               "value":0.69
            }
         }
      },
      "timeStamp":"2020-02-23T02:22:39.155Z"
   },
   {
      "msg":{
         "speaker":"Human",
         "addressee":"Watson",
         "text":"Watson I'll buy 1 packet of blueberries for $0.30",
         "role":"buyer",
         "environmentUUID":"abcdefg",
         "timestamp":1582424571761
      },
      "timeStamp":"2020-02-23T02:22:51.764Z"
   }
]
```


`/viewTotals (GET)`
-----

This API is called with no parameters to obtain the current total goods bought or sold by each agent, along with the price.

Example response:

```
{
   "Celia":{
      "price":24.61,
      "quantity":{
         "egg":4,
         "flour":6,
         "milk":5,
         "chocolate":6,
         "vanilla":5
      }
   },
   "Human":{
      "price":29.66,
      "quantity":{
         "egg":5,
         "flour":8,
         "milk":7,
         "chocolate":6,
         "sugar":1,
         "vanilla":5
      }
   },
   "Watson":{
      "price":5.05,
      "quantity":{
         "sugar":1,
         "egg":1,
         "flour":2,
         "milk":2
      }
   }
}
```