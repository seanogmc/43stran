const PERSON_EMAILS = {
  Theo: "tmcaleer2k18@gmail.com",
  "Sean Og": "seanogmc@yahoo.com",
  Sean: "seanmcgold1@gmail.com",
  Conor: "",
};

const EMAIL_TO_PERSON = Object.fromEntries(
  Object.entries(PERSON_EMAILS).map(([name, email]) => [
    email.toLowerCase(),
    name,
  ]),
);
