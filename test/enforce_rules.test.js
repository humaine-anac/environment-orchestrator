let {rule1Evaluation, rule2Evaluation, rule4Evaluation, isSpeakerBot, rule0Evaluation, rule3Evaluation} = require("../enforce-rules");

// RULE1EVALUATION
describe('rule1Evaluation', () => {
    const data = {
        roundId: "true",
        speaker: "Human",
        addressee: "Watson",
        text: "Watson, I will buy 3 eggs for $4",
        role: "buyer",
        timestamp: 1595945030581,
    };

    test.each([
        [{"type": "Accept", "price": {"value": 10}}, 50, {permit: true, rationale: null}],
        [{"type": "Reject", "price": {"value": 10}}, 50, {permit: true, rationale: null}],
        [{"price": {"value": 10}}, 50, {permit: true, rationale: null}],
        [{"type": "Accept", "price": {"value": 49}}, 50, {permit: true, rationale: null}],
        [{"type": "Accept", "price": {"value": 50}}, 50, {permit: true, rationale: null}],
        [{"type": "Accept", "price": {"value": 51}}, 50, {permit: false, rationale: "Insufficient budget"}],
        [{"type": "Accept"}, 50, {permit: true, rationale: null}]
    ])("Given bid %j and budget %s, expect %j", (bid, budget, expected) => {
        const testData = Object.assign({}, data, {bid});
        expect(rule1Evaluation(testData, budget)).toEqual(expected);
    });
});

// RULE4EVALUATION
describe('rule4Evaluation', () => {
    test.each([
        [{"text": "a b c d e f g h i j k l m n o p q r s t u v w x y z a b c d e f g h i j k l m n o p q r s t u v w x y z a b c d e f g h i j k l m n o p q r s t u v w x y z a b c d e f g h i j k l m n o p q r s t u"}, {permit: true, rationale: null}],
        [{"text": "a b c d e f g h i j k l m n o p q r s t u v w x y z a b c d e f g h i j k l m n o p q r s t u v w x y z a b c d e f g h i j k l m n o p q r s t u v w x y z a b c d e f g h i j k l m n o p q r s t u v"}, {permit: true, rationale: null}],
        [{"text": "a b c d e f g h i j k l m n o p q r s t u v w x y z a b c d e f g h i j k l m n o p q r s t u v w x y z a b c d e f g h i j k l m n o p q r s t u v w x y z a b c d e f g h i j k l m n o p q r s t u v w"}, {permit: false, rationale: "Excessive message length"}],
        [{}, {permit: true, rationale: null}]
    ])(`Given text %s, expect %j`, (text, expected) => {
        expect(rule4Evaluation(text)).toEqual(expected);
    });
});

// ISSPEAKERBOT
describe('isSpeakerBot', () => {
    test.each([
        [{"speaker": "Human"}, false],
        [{"speaker": "Watson"}, true]
    ])(`Given text %s, expect %s`, (data, expected) => {
        expect(isSpeakerBot(data)).toEqual(expected);
    });
});

// RULE0EVALUATION
describe('rule0evaluation', () => {

    const now = Date.now();

    const message = {
        "text": "I'll buy 3 egg for 4 USD.",
        "speaker": "Human",
        "role": "seller",
        "addressee": "Watson",
        "roundId": "true"
    };

    const queue = [
        {
            "msg": {
            "roundId": "true",
            "speaker": "Human",
            "addressee": "Watson",
            "text": "Watson, I will buy 3 eggs for $4",
            "role": "buyer"
            },
            "timeStamp": new Date(now)
        }
    ];

    const large_queue = [
        {
            "msg": {
            "roundId": "true",
            "speaker": "Human",
            "addressee": "Watson",
            "text": "Watson, I will buy 3 eggs for $4",
            "role": "buyer"
            },
            "timeStamp": new Date(now - 0.2)
        },
        {
            "msg": {
            "roundId": "true",
            "speaker": "Human",
            "addressee": "Watson",
            "text": "Watson, I will buy 3 eggs for $4",
            "role": "buyer"
            },
            "timeStamp": new Date(now)
        }
    ];

    const agent_queue = [
        {
            "msg": {
            "roundId": "true",
            "speaker": "Human",
            "addressee": "Watson",
            "text": "Watson, I will buy 3 eggs for $4",
            "role": "buyer"
            },
            "timeStamp": new Date(now - 0.2)
        },
        {
            "msg": {
            "roundId": "true",
            "speaker": "Watson",
            "addressee": "Human",
            "text": "Watson, I will buy 3 eggs for $4",
            "role": "buyer"
            },
            "timeStamp": new Date(now)
        }
    ];

    test.each([
        [message, queue, "Human", new Date(now + 600), {permit: true, rationale: null}],
        [message, queue, "Human", new Date(now + 500), {permit: true, rationale: null}],
        [message, queue, "Human", new Date(now - 500), {permit: false, rationale: "Recent human utterance."}],
        [message, [], "Human", new Date(now), {permit: true, rationale: null}],
        [message, large_queue, "Human", new Date(now), {permit: false, rationale: "Recent human utterance."}],
        [message, agent_queue, "Human", new Date(now + 0.2), {permit: true, rationale: null}],
        [message, queue, "Watson", new Date(now), {permit: true, rationale: null}]
    ])("Given message %j, queue %j, speaker %s, and time %s: expect %j", (message, queue, speaker, now, expected) => {
        let testMessage = Object.assign({}, message, {now});
        testMessage = Object.assign({}, testMessage, {speaker});
        expect(rule0Evaluation(testMessage, queue)).toEqual(expected);
    });
});

describe('rule3evaluation', ()=> {

    const humanMessage = {
        "text": "I'll buy 3 egg for 4 USD.",
        "speaker": "Human",
        "role": "Buyer",
        "addressee": "Watson",
        "roundId": "true"
    };

    const watsonMessage = {
        "text": "I'll buy 3 egg for 4 USD.",
        "speaker": "Watson",
        "role": "seller",
        "addressee": "Human",
        "roundId": "true"
    };

    const celiaMessage = {
        "text": "I'll buy 3 egg for 4 USD.",
        "speaker": "Celia",
        "role": "seller",
        "addressee": "Human",
        "roundId": "true"
    };

    test.each([
        [watsonMessage, [{"msg": humanMessage}], {permit: true, rationale: null}],
        [humanMessage, [{"msg": humanMessage}], {permit: true, rationale: null}],
        [watsonMessage, [{"msg": humanMessage}, {"msg": celiaMessage}], {permit: true, rationale: null}],
        [watsonMessage, [{"msg": humanMessage}, {"msg": watsonMessage}, {"msg": celiaMessage}], {permit: false, rationale: "Quantity of agents messages exceeded"}],
        [watsonMessage, [{"msg": humanMessage}, {"msg": watsonMessage}], {permit: false, rationale: "Agent speaking twice"}],
        [celiaMessage, [{"msg": humanMessage}, {"msg": celiaMessage}, {"msg": humanMessage}], {permit: true, rationale: null}],
        [watsonMessage, [{"msg": humanMessage}, {"msg": celiaMessage}, {"msg": watsonMessage}, {"msg": humanMessage}], {permit: true, rationale: null}],
    ])("%s", (message, queue, expected) => {
        expect(rule3Evaluation(message, queue)).toEqual(expected);
    });
});

// RULE2EVALUATION
describe('rule2evaluation', () => {

    const now = Date.now();

    const message = {
        "text": "I'll buy 3 egg for 4 USD.",
        "role": "seller",
        "addressee": "Human",
        "roundId": "true"
    };
    const human_message = {
        "text": "I'll buy 3 egg for 4 USD.",
        "role": "seller",
        "addressee": "Watson",
        "roundId": "true"
    };

    const queue = [
        {
            "msg": {
            "roundId": "true",
            "speaker": "Human",
            "addressee": "Watson",
            "text": "Watson, I will buy 3 eggs for $4",
            "role": "buyer"
            },
            "timeStamp": new Date(now)
        }
    ];

    const queue_no_addressee = [
        {
            "msg": {
            "roundId": "true",
            "speaker": "Human",
            "text": "Watson, I will buy 3 eggs for $4",
            "role": "buyer"
            },
            "timeStamp": new Date(now - 0.2)
        }
    ];

    const agent_queue = [
        {
            "msg": {
            "roundId": "true",
            "speaker": "Human",
            "addressee": "Watson",
            "text": "Watson, I will buy 3 eggs for $4",
            "role": "buyer"
            },
            "timeStamp": new Date(now - 0.2)
        },
        {
            "msg": {
            "roundId": "true",
            "speaker": "Celia",
            "addressee": "Human",
            "text": "Watson, I will buy 3 eggs for $4",
            "role": "buyer"
            },
            "timeStamp": new Date(now)
        }
    ];

    const large_queue_no_addressee = [
        {
            "msg": {
            "roundId": "true",
            "speaker": "Human",
            "text": "Watson, I will buy 3 eggs for $4",
            "role": "buyer"
            },
            "timeStamp": new Date(now - 0.2)
        },
        {
            "msg": {
            "roundId": "true",
            "speaker": "Celia",
            "text": "Deal",
            "role": "buyer"
            },
            "timeStamp": new Date(now)
        }
    ];

    test.each([
        [message, queue, "Celia", new Date(now + 3000), 2000, false, {permit: true, rationale: null}],
        [message, queue, "Celia", new Date(now), 2000, false, {permit: false, rationale: "Premature response from unaddressed agent"}],
        [message, queue, "Watson", new Date(now + 4000), 3000, false, {permit: false, rationale: "Addressee message delayed"}],
        [message, queue, "Watson", new Date(now + 2000), 3000, false, {permit: true, rationale: null}],
        [message, agent_queue, "Watson", new Date(now + 2000), 3000, false, {permit: false, rationale: "The unaddressed agent just replied the sentence."}],
        [human_message, queue, "Human", new Date(now), 2000, false, {permit: true, rationale: null}],
        [message, queue_no_addressee, "Watson", new Date(now), 2000, true, {permit: true, rationale: null}],
        [message, large_queue_no_addressee, "Watson", new Date(now), 2000, false, {permit: false, rationale: "Agents speaking at same time"}],
        [message, large_queue_no_addressee, "Watson", new Date(now + 50), 2000, false, {permit: true, rationale: null}]
    ])("Given message %j, queue %j, speaker %s, and time %s: expect %j", (message, queue, speaker, now, responseTimeLimit, canTalkAtOnce, expected) => {
        let testMessage = Object.assign({}, message, {now});
        testMessage = Object.assign({}, testMessage, {speaker});
        expect(rule2Evaluation(testMessage, queue, responseTimeLimit, canTalkAtOnce)).toEqual(expected);
    });
});