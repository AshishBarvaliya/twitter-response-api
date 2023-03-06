const express = require("express");
const cors = require("cors");
const serverless = require("serverless-http");
const app = express();
const bodyParser = require("body-parser");
const { Configuration, OpenAIApi } = require("openai");
const Twit = require("twit");
const TwitterApi = require("twitter-api-v2").default;
require("dotenv").config();

app.use(cors());
app.use(bodyParser.json());

const router = express.Router();

const twitterClient = new TwitterApi({
  clientId: process.env.AUTH_CLIENT_ID,
  clientSecret: process.env.AUTH_CLIENT_SECRET,
});
const callbackURL = process.env.CALLBACK_URL;

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

let gcodeVerifier, gstate, grefreshToken, gaccessToken;

const T = new Twit({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token: process.env.TWITTER_ACCESS_TOKEN,
  access_token_secret: process.env.TWITTER_ACCESS_SECRET,
});

router.get("/auth", (req, res) => {
  const { url, state, codeVerifier } = twitterClient.generateOAuth2AuthLink(
    callbackURL,
    { scope: ["tweet.read", "tweet.write", "users.read", "offline.access"] }
  );

  // saving to global variable
  gstate = state;
  gcodeVerifier = codeVerifier;

  res.send({ rurl: url });
});

router.get("/", (_, res) => {
  res.json({ test: "hello" });
});

router.get("/callback", async (req, res) => {
  const { state, code } = req.query;

  if (state !== gstate) {
    return response.status(400).send("Stored tokens do not match!");
  }

  const {
    client: loggedClient,
    accessToken,
    refreshToken,
  } = await twitterClient.loginWithOAuth2({
    code,
    codeVerifier: gcodeVerifier,
    redirectUri: callbackURL,
  });

  gaccessToken = accessToken;
  grefreshToken = refreshToken;

  const { data } = await loggedClient.v2.me();

  res.send(data);
});

router.post("/gettweets", (req, res) => {
  const query = req.body.q;
  const count = req.body.count || 10;

  T.get("search/tweets", { q: query, count, lang: "en" }, (err, data) => {
    if (err) {
      res.status(500).send("Error retrieving tweets");
    } else {
      res.status(200).send(data);
    }
  });
});

router.post("/posttweet", async (req, res) => {
  const tweet = req.body.tweet;
  const tweetId = req.body.tweetId;

  const {
    client: refreshedClient,
    // accessToken,
    // refreshToken: newRefreshToken,
  } = await twitterClient.refreshOAuth2Token(grefreshToken);

  const { data } = await refreshedClient.v2.reply(tweet, tweetId);
  res.send({ data });
});

router.post("/getAnalysis", async (req, res) => {
  const response = await openai.createCompletion({
    model: "text-davinci-003",
    prompt: req.body.tweets,
    temperature: 0,
    max_tokens: 60,
    top_p: 1.0,
    frequency_penalty: 0.5,
    presence_penalty: 0.0,
  });
  res.send({ data: response.data.choices[0].text });
});

app.use("/.netlify/functions/api", router);

module.exports.handler = serverless(app);
