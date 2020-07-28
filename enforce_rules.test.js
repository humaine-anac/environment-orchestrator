let {allowMessage, rule1Evaluation, rule4Evaluation} = require("./enforce-rules");
let test_data = require("./enforce_rules_test_data.json");

// RULE1EVALUATION
// describe('rule1Evaluation', () => {
//     const data = {
//       roundId: "true",
//       speaker: "Human",
//       addressee: "Watson",
//       text: "Watson, I will buy 3 eggs for $4",
//       role: "buyer",
//       timestamp: 1595945030581,
//     };
//     // Test if "accept" message passes
//     test('accept pass', () => {
//         const testData = Object.assign({}, data, {bid: {"type": "Accept", "price": {"value": 10}}});
//         expect(rule1Evaluation(testData, 50)).toEqual({permit: true, rationale: null});
//     });

//     // Test if non-accept message passes
//     test('non-accept pass', () => {
//         const testData = Object.assign({}, data, {bid: {"type": "Reject", "price": {"value": 10}}});
//         expect(rule1Evaluation(testData, 50)).toEqual({permit: true, rationale: null});
//     });

//     // Test if value, type not given
//     test('no type given pass', () => {
//         const testData = Object.assign({}, data, {bid: {"price": {"value": 10}}});
//         expect(rule1Evaluation(testData, 50)).toEqual({permit: true, rationale: null});
//     });

//     // humanbudget > bidamount
//     test('greater amount pass', () => {
//         const testData = Object.assign({}, data, {bid: {"type": "Accept", "price": {"value": 49}}});
//         expect(rule1Evaluation(testData, 50)).toEqual({permit: true, rationale: null});
//     });

//     // humanbudget === bidamount
//     test('budget = bid pass', () => {
//         const testData = Object.assign({}, data, {bid: {"type": "Accept", "price": {"value": 50}}});
//         expect(rule1Evaluation(testData, 50)).toEqual({permit: true, rationale: null});
//     });

//     // humanbudget < bidamount
//     test('bid > budget pass', () => {
//         const testData = Object.assign({}, data, {bid: {"type": "Accept", "price": {"value": 51}}});
//         expect(rule1Evaluation(testData, 50)).toEqual({permit: false, rationale: "Insufficient budget"});
//     });

//     // test if function fails if no bid value given
//     test('no bid value pass', () => {
//         const testData = Object.assign({}, data, {bid: {"type": "Accept"}});
//         expect(rule1Evaluation(testData, 50)).toEqual({permit: true, rationale: null});
//     });
// });

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