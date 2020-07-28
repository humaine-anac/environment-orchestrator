let {allowMessage, rule1Evaluation, rule4Evaluation} = require("./enforce-rules");
let test_data = require("./enforce_rules_test_data.json");

// RULE1EVALUATION
// Test if "accept" message passes
test('rule1 accept pass', () => {
    expect(rule1Evaluation(test_data.rule1.test1, 50)).toEqual({permit: true, rationale: null});
});

// Test if non-accept message passes
test('rule1 non-accept pass', () => {
    expect(rule1Evaluation(test_data.rule1.test2, 50)).toEqual({permit: true, rationale: null});
});

// Test if value, type not given
test('rule1 no type given pass', () => {
    expect(rule1Evaluation(test_data.rule1.test3, 50)).toEqual({permit: true, rationale: null});
});

// humanbudget > bidamount
test('rule1 greater amount pass', () => {
    expect(rule1Evaluation(test_data.rule1.test4, 50)).toEqual({permit: true, rationale: null});
});

// humanbudget === bidamount
test('rule1 budget = bid pass', () => {
    expect(rule1Evaluation(test_data.rule1.test5, 50)).toEqual({permit: true, rationale: null});
});

// humanbudget < bidamount
test('rule1 bid > budget pass', () => {
    expect(rule1Evaluation(test_data.rule1.test6, 50)).toEqual({permit: false, rationale: "Insufficient budget"});
});

// test if function fails if no bid given
test('rule1 no bid value pass', () => {
    expect(rule1Evaluation(test_data.rule1.test7, 50)).toEqual({permit: true, rationale: null});
});

// RULE4EVALUATION
// Test if message.len < 100 passes

// Test if message.len === 100 fails

// Test if message.len > 100 fails

// Test if function fails without ['text'] given

// test if function fails if ['text'] is non-alphabetic