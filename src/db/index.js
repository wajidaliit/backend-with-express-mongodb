import mongoose from "mongoose";
import { DB_NAME } from "../constants.js"; 



const connectDB = async () => {
  try {
    const connectionInstance = mongoose.connect(
      `${process.env.MONGODB_URI}/${DB_NAME}`
    );

    console.log(
      `Mongodb connected !! with HOST: ${(await connectionInstance).connection.host}`
    ); 

  } catch (error) {
    console.log("error: ", error);
    process.exit(1);
  }
};

export default connectDB;
