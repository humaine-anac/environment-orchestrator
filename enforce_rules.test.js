let {allowMessage, rule1Evaluation, rule4Evaluation} = require("./enforce-rules");

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
    // Test if "accept" message passes
    test('accept pass', () => {
        const testData = Object.assign({}, data, {bid: {"type": "Accept", "price": {"value": 10}}});
        expect(rule1Evaluation(testData, 50)).toEqual({permit: true, rationale: null});
    });

    // Test if non-accept message passes
    test('non-accept pass', () => {
        const testData = Object.assign({}, data, {bid: {"type": "Reject", "price": {"value": 10}}});
        expect(rule1Evaluation(testData, 50)).toEqual({permit: true, rationale: null});
    });

    // Test if value, type not given
    test('no type given pass', () => {
        const testData = Object.assign({}, data, {bid: {"price": {"value": 10}}});
        expect(rule1Evaluation(testData, 50)).toEqual({permit: true, rationale: null});
    });

    // humanbudget > bidamount
    test('greater amount pass', () => {
        const testData = Object.assign({}, data, {bid: {"type": "Accept", "price": {"value": 49}}});
        expect(rule1Evaluation(testData, 50)).toEqual({permit: true, rationale: null});
    });

    // humanbudget === bidamount
    test('budget = bid pass', () => {
        const testData = Object.assign({}, data, {bid: {"type": "Accept", "price": {"value": 50}}});
        expect(rule1Evaluation(testData, 50)).toEqual({permit: true, rationale: null});
    });

    // humanbudget < bidamount
    test('bid > budget pass', () => {
        const testData = Object.assign({}, data, {bid: {"type": "Accept", "price": {"value": 51}}});
        expect(rule1Evaluation(testData, 50)).toEqual({permit: false, rationale: "Insufficient budget"});
    });

    // test if function fails if no bid value given
    test('no bid value pass', () => {
        const testData = Object.assign({}, data, {bid: {"type": "Accept"}});
        expect(rule1Evaluation(testData, 50)).toEqual({permit: true, rationale: null});
    });
});

// RULE4EVALUATION
// Test if message.len < 100 passes
// test('rule1 len < 100 pass', () => {
//     expect(rule4Evaluation(test_data.rule4.test1)).toEqual({permit: true, rationale: null});
// });

// // Test if message.len === 100 fails
// test('rule1 len = 100 pass', () => {
//     expect(rule4Evaluation(test_data.rule4.test2)).toEqual({permit: true, rationale: null});
// });

// // Test if message.len > 100 fails
// test('rule1 len > 100 pass', () => {
//     expect(rule4Evaluation(test_data.rule4.test3)).toEqual({permit: false, rationale: "Excessive message length"});
// });

// // Test if function passes without ['text'] given
// test('rule1 no text given pass', () => {
//     expect(rule4Evaluation(test_data.rule4.test4)).toEqual({permit: true, rationale: null});
// });