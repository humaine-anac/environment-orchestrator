let {rule1Evaluation, rule4Evaluation} = require("../enforce-rules");

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