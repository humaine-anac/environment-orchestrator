let {allowMessage, rule1Evaluation, rule4Evaluation} = require("../enforce-rules");

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