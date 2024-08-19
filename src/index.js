import dotenv from "dotenv";

import connectDB from "./db/index.js";
import { app } from "./app.js";
dotenv.config({ path: "./env" });

const port = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.on("error", (error) => {
      console.log("ERROR: ", error);
      throw error;
    });

    app.listen(port, () => {
      console.log(`App runing on port: ${port}`);
    });
  })
  .catch((error) => {
    console.log("MonogoDB connection error: ", error);
  });
