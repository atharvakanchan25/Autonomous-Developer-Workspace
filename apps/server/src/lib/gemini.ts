import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "./config";

// single shared instance — reused across all LLM calls
export const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
