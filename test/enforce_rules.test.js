let {rule1Evaluation, rule4Evaluation, isSpeakerBot, rule0Evaluation} = require("../enforce-rules");

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
            "timeStamp": new Date()
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
            "timeStamp": new Date()
        },
        {
            "msg": {
            "roundId": "true",
            "speaker": "Human",
            "addressee": "Watson",
            "text": "Watson, I will buy 3 eggs for $4",
            "role": "buyer"
            },
            "timeStamp": new Date()
        }
    ];

    test.each([
        [1, message, queue, "Human", new Date() + 0.6, {permit: true, rationale: null}],
        [2, message, queue, "Human", new Date() + 0.5, {permit: true, rationale: null}],
        [3, message, queue, "Human", new Date() - 10, {permit: false, rationale: "Recent human utterance."}],
        [4, message, [], "Human", new Date(), {permit: true, rationale: null}],
        [5, message, large_queue, "Human", new Date() + 1, {permit: false, rationale: "Recent human utterance."}],
        [6, message, queue, "Watson", new Date(), {permit: true, rationale: null}]
    ])("Given message %j, queue %j, speaker %s, and time %s: expect %j", (id, message, queue, speaker, now, expected) => {
        let testMessage = Object.assign({}, message, {now});
        testMessage = Object.assign({}, testMessage, {speaker});
        expect(rule0Evaluation(testMessage, queue)).toEqual(expected);
    });
});

