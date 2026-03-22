import OpenAI from "openai";
import { config } from "./config";

export const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
