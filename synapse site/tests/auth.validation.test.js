const { parseRegisterInput, parseLoginInput } = require("../server/validation/auth");

describe("validazione autenticazione", function () {
  it("accetta una registrazione valida", function () {
    const result = parseRegisterInput({
      username: "Synapse User",
      email: "USER@example.com",
      password: "Password1",
      passwordConfirm: "Password1",
      marketingOptIn: true,
    });

    expect(result.success).toBe(true);
    expect(result.data.email).toBe("user@example.com");
    expect(result.data.marketingOptIn).toBe(true);
  });

  it("accetta qualsiasi password non vuota (nessun vincolo di complessita')", function () {
    const result = parseRegisterInput({
      username: "Synapse User",
      email: "user@example.com",
      password: "ciao",
      passwordConfirm: "ciao",
      marketingOptIn: false,
    });

    expect(result.success).toBe(true);
  });

  it("rifiuta se le password non coincidono", function () {
    const result = parseRegisterInput({
      username: "Synapse User",
      email: "user@example.com",
      password: "ciao",
      passwordConfirm: "mondo",
      marketingOptIn: false,
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/coincidono/i);
  });

  it("rifiuta un login senza password", function () {
    const result = parseLoginInput({
      email: "user@example.com",
      password: "",
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/password/i);
  });
});
