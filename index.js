import http from "node:http";
import fs from "node:fs";
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from "openai";
import {Ollama} from 'ollama';
import weatherService from './services/weatherService.js';

dotenv.config();

const anthropic = new Anthropic({
    apiKey: process.env["ANTHROPIC_API_KEY"],
});
const deepSeekApi = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env["DEEPSEEK_KEY"]
});
const openAiApi = new OpenAI({
    apiKey: process.env["OPENAI_KEY"]
});

let searchSystemPrompt='Output in JSON only with keys: "latitude"(location latitude), "longitude" (location longitude), "name" (name of location), "address" (address of location), "url" (a related website) if available, and "weather_relevant" (boolean indicating if weather information would be relevant for this query). Output as array only.';
let discoverSystemPrompt="Keep it brief. If weather conditions are available for this location, include them in your response.";

async function claude(requestType,systemPrompt,prompts) {
    let messages=[];
    let finalSystemPrompt=systemPrompt;
    if(requestType==="search") finalSystemPrompt=systemPrompt+" Do not include any other verbiage besides the json.";
    for(let i=0;i<prompts.length;i++) {
        messages.push(prompts[i]);
    }
    return anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        system:finalSystemPrompt,
        messages: messages,
    });
}
async function deepseek(requestType,systemPrompt,prompts) {
    let messages=[];
    let finalSystemPrompt=systemPrompt;
    if(requestType==="search") finalSystemPrompt=systemPrompt + ". Do not include markdown tags.";
    messages.push({role: "system", content: finalSystemPrompt});
    for(let i=0;i<prompts.length;i++) {
        messages.push(prompts[i]);
    }
    return deepSeekApi.chat.completions.create({
        messages: messages,
        model: "deepseek-chat",
    });
}
async function openai(requestType,systemPrompt,prompts) {
    let messages=[];
    let finalSystemPrompt=systemPrompt;
    if(requestType==="search") finalSystemPrompt=systemPrompt + ". Do not include markdown tags.";
    messages.push({role: "system", content: finalSystemPrompt});
    for(let i=0;i<prompts.length;i++) {
        messages.push(prompts[i]);
    }
    return openAiApi.chat.completions.create({
        messages: messages,
        model: "gpt-4o",
        store:false
    });
}
async function local(requestType,systemPrompt,prompts){
    let messages=[];
    let finalSystemPrompt=systemPrompt;
    if(requestType==="search") finalSystemPrompt=systemPrompt + ". Do not include markdown tags.";
    messages.push({role: "system",content:finalSystemPrompt});
    for(let i=0;i<prompts.length;i++) {
        messages.push(prompts[i]);
    }
    const ollama = new Ollama({host:'http://'+process.env["OLLAMA_HOST"]+':'+process.env["OLLAMA_PORT"]})
    return await ollama.chat({ model: process.env["OLLAMA_MODEL"], messages: messages, stream: false })
}

async function searchOutput(responsePayload, serverResponse, modelResponse, model) {
    serverResponse.setHeader('Access-Control-Allow-Headers', '*');
    serverResponse.setHeader('Access-Control-Allow-Origin', '*');
    serverResponse.writeHead(200, {'Content-Type': 'application/json'});
    let result = '';
    if (model === "anthropic") result = modelResponse.content[0].text;
    else if (model === "local") result = modelResponse.message.content;
    else result = modelResponse.choices[0].message.content;
    
    // Clean up the result
    if (result.includes('```')) {
        result = result.replace('```', '');
        result = result.replace('```', '');
        if (result.includes('json')) result = result.replace('json', '');
    }
    
    // Parse the result
    result = JSON.parse(result);
    
    // Handle both array and object responses
    if (!Array.isArray(result)) {
        responsePayload.data = [];
        responsePayload.data.push(result);
    } else {
        responsePayload.data = result;
    }
    
    // Add weather data for locations where weather is relevant
    const weatherPromises = responsePayload.data
        .filter(location => location.weather_relevant === true)
        .map(async (location) => {
            try {
                const weatherData = await weatherService.getCurrentWeather(location.latitude, location.longitude);
                return {
                    locationIndex: responsePayload.data.indexOf(location),
                    weatherData
                };
            } catch (error) {
                console.error(`Failed to fetch weather for ${location.name}:`, error);
                return {
                    locationIndex: responsePayload.data.indexOf(location),
                    weatherData: null
                };
            }
        });
    
    // Add weather data to response if available
    if (weatherPromises.length > 0) {
        const weatherResults = await Promise.all(weatherPromises);
        weatherResults.forEach(result => {
            if (result.weatherData) {
                responsePayload.data[result.locationIndex].weather = result.weatherData;
            }
        });
    }
    
    serverResponse.write(JSON.stringify(responsePayload));
    return serverResponse.end();
}
async function discoverOutput(responsePayload, serverResponse, modelResponse, model) {
    serverResponse.setHeader('Access-Control-Allow-Headers', '*');
    serverResponse.setHeader('Access-Control-Allow-Origin', '*');
    serverResponse.writeHead(200,{'Content-Type':'application/json'});
    let result = '';
    if (model === "anthropic") result = modelResponse.content[0].text;
    else if (model === "local") result = modelResponse.message.content;
    else result = modelResponse.choices[0].message.content;
    
    // Add to response payload
    responsePayload.data = result;
    
    serverResponse.write(JSON.stringify(responsePayload));
    return serverResponse.end();
}
//
function userLocationPrompt(userLocation) {
    return "Convert my location ["+userLocation.latitude+", "+userLocation.longitude+"] to the nearest city and use that city as reference for requests that need my location. Use a 50 mile radius as a baseline."
}

const server=http.createServer((req, serverResponse)=>{
    let b ='';
    let responsePayload={};
    let reqPath=req.url.split('/');
    if(req.url==='/' || ['search','discover'].indexOf(reqPath[1])>-1) {
        fs.readFile('public/index.html',(err, data)=> {
            serverResponse.writeHead(200,{'Content-Type':'text/html'});
            serverResponse.write(data);
            return serverResponse.end();
        });
    }
    else if(req.url.split(".")[2]==="js") {
        fs.readFile('public/'+req.url,(err, data)=> {
            if(err) {
                serverResponse.writeHead(200,{'Content-Type':'application/json'});
                serverResponse.write(JSON.stringify({error:'error retrieving script'}));
            }
            else {
                serverResponse.writeHead(200,{'Content-Type':'text/javascript'});
                serverResponse.write(data);
            }
            return serverResponse.end();
        });
    }
    else if(req.url.split(".")[2]==="css") {
        fs.readFile('public/'+req.url,(err, data)=> {
            if(err) {
                serverResponse.writeHead(200,{'Content-Type':'application/json'});
                serverResponse.write(JSON.stringify({error:'error retrieving stylesheet'}));
            }
            else {
                serverResponse.writeHead(200,{'Content-Type':'text/css'});
                serverResponse.write(data);
            }
            return serverResponse.end();
        });
    }
    else if(req.url.split(".")[1]==="png") {
        fs.readFile('public/'+req.url,(err, data)=> {
            if(err) {
                serverResponse.writeHead(200,{'Content-Type':'application/json'});
                serverResponse.write(JSON.stringify({error:'error retrieving image'}));
            }
            else {
                serverResponse.writeHead(200,{'Content-Type':'image/png'});
                serverResponse.write(data);
            }
            return serverResponse.end();
        });
    }
    else if(req.url.split(".")[1]==="gif") {
        fs.readFile('public/'+req.url,(err, data)=> {
            if(err) {
                serverResponse.writeHead(200,{'Content-Type':'application/json'});
                serverResponse.write(JSON.stringify({error:'error retrieving image'}));
            }
            else {
                serverResponse.writeHead(200,{'Content-Type':'image/gif'});
                serverResponse.write(data);
            }
            return serverResponse.end();
        });
    }
    else if(req.url.split(".")[1]==="json") {
        fs.readFile('public/src/'+req.url,(err, data)=> {
            serverResponse.writeHead(200,{'Content-Type':'text/json'});
            serverResponse.write(data);
            return serverResponse.end();
        });
    }
    else if(reqPath[1]==="api" && reqPath[2]==="weather") {
        serverResponse.setHeader('Access-Control-Allow-Headers', '*');
        serverResponse.setHeader('Access-Control-Allow-Origin', '*');
        serverResponse.setHeader('Content-Type', 'application/json');
        
        if (req.method === 'OPTIONS') {
            serverResponse.writeHead(200);
            return serverResponse.end();
        }
        
        if(reqPath[3]==="current") {
            req.on('data', (chunk) => {
                b += chunk;
            });
            req.on('end', async () => {
                try {
                    const data = JSON.parse(b);
                    const { latitude, longitude } = data;
                    
                    if (!latitude || !longitude) {
                        serverResponse.writeHead(400);
                        serverResponse.write(JSON.stringify({ error: 'Latitude and longitude are required' }));
                        return serverResponse.end();
                    }
                    
                    console.log(`Weather API request for [${latitude}, ${longitude}]`);
                    const weatherData = await weatherService.getCurrentWeather(latitude, longitude);
                    console.log('Weather data received:', JSON.stringify(weatherData).substring(0, 200) + '...');
                    serverResponse.writeHead(200);
                    serverResponse.write(JSON.stringify(weatherData));
                    return serverResponse.end();
                } catch (error) {
                    console.error('Error in current weather endpoint:', error);
                    serverResponse.writeHead(500);
                    serverResponse.write(JSON.stringify({ error: 'Failed to fetch weather data' }));
                    return serverResponse.end();
                }
            });
        }
        else if(reqPath[3]==="forecast") {
            req.on('data', (chunk) => {
                b += chunk;
            });
            req.on('end', async () => {
                try {
                    const data = JSON.parse(b);
                    const { latitude, longitude } = data;
                    
                    if (!latitude || !longitude) {
                        serverResponse.writeHead(400);
                        serverResponse.write(JSON.stringify({ error: 'Latitude and longitude are required' }));
                        return serverResponse.end();
                    }
                    
                    const forecastData = await weatherService.getWeatherForecast(latitude, longitude);
                    serverResponse.writeHead(200);
                    serverResponse.write(JSON.stringify(forecastData));
                    return serverResponse.end();
                } catch (error) {
                    console.error('Error in forecast endpoint:', error);
                    serverResponse.writeHead(500);
                    serverResponse.write(JSON.stringify({ error: 'Failed to fetch forecast data' }));
                    return serverResponse.end();
                }
            });
        }
        else if(reqPath[3]==="hurricane") {
            req.on('end', async () => {
                try {
                    const hurricaneData = await weatherService.getHurricaneData();
                    serverResponse.writeHead(200);
                    serverResponse.write(JSON.stringify(hurricaneData));
                    return serverResponse.end();
                } catch (error) {
                    console.error('Error in hurricane endpoint:', error);
                    serverResponse.writeHead(500);
                    serverResponse.write(JSON.stringify({ error: 'Failed to fetch hurricane data' }));
                    return serverResponse.end();
                }
            });
        }
        else if(reqPath[3]==="wildfire") {
            req.on('data', (chunk) => {
                b += chunk;
            });
            req.on('end', async () => {
                try {
                    let days = 1;
                    if (b) {
                        const data = JSON.parse(b);
                        days = data.days || 1;
                    }
                    
                    const wildfireData = await weatherService.getWildfireData(days);
                    serverResponse.writeHead(200);
                    serverResponse.write(JSON.stringify(wildfireData));
                    return serverResponse.end();
                } catch (error) {
                    console.error('Error in wildfire endpoint:', error);
                    serverResponse.writeHead(500);
                    serverResponse.write(JSON.stringify({ error: 'Failed to fetch wildfire data' }));
                    return serverResponse.end();
                }
            });
        }
        else if(reqPath[3]==="disasters") {
            req.on('end', async () => {
                try {
                    const disasterData = await weatherService.getNaturalDisasterData();
                    serverResponse.writeHead(200);
                    serverResponse.write(JSON.stringify(disasterData));
                    return serverResponse.end();
                } catch (error) {
                    console.error('Error in natural disasters endpoint:', error);
                    serverResponse.writeHead(500);
                    serverResponse.write(JSON.stringify({ error: 'Failed to fetch natural disaster data' }));
                    return serverResponse.end();
                }
            });
        }
        else if(reqPath[3]==="tiles") {
            req.on('data', (chunk) => {
                b += chunk;
            });
            req.on('end', async () => {
                try {
                    const data = JSON.parse(b);
                    const { layerType, zoomCategory, bounds } = data;
                    
                    if (!layerType || !zoomCategory) {
                        serverResponse.writeHead(400);
                        serverResponse.write(JSON.stringify({ error: 'Layer type and zoom category are required' }));
                        return serverResponse.end();
                    }
                    
                    console.log(`Weather tile metadata request for ${layerType} at ${zoomCategory} zoom`);
                    const tileMetadata = await weatherService.getWeatherTileMetadata({
                        layerType,
                        zoomCategory,
                        bounds
                    });
                    
                    serverResponse.writeHead(200);
                    serverResponse.write(JSON.stringify(tileMetadata));
                    return serverResponse.end();
                } catch (error) {
                    console.error('Error in tile metadata endpoint:', error);
                    serverResponse.writeHead(500);
                    serverResponse.write(JSON.stringify({ error: 'Failed to fetch tile metadata' }));
                    return serverResponse.end();
                }
            });
        }
        else {
            serverResponse.writeHead(404);
            serverResponse.write(JSON.stringify({ error: 'Weather API endpoint not found' }));
            return serverResponse.end();
        }
    }
    else if(reqPath[1]==="api") {
        if(reqPath[2]==='query') {
            req.on('data', (chunk) => {
                b+=chunk;
            });
            req.on('end', () => {
                if(b) {
                    let q=JSON.parse(b)
                    let userPrompt=q.prompt;
                    let modelUsed=q.model || "anthropic";
                    let userLocation=q.myLocation;
                    let messages=[];
                    if(userLocation && userLocation.latitude && userLocation.longitude) messages.push({role:"user",content:userLocationPrompt(userLocation)})
                    messages.push({role:"user",content:userPrompt});
                    if(modelUsed==="anthropic") {
                        claude("search",searchSystemPrompt,messages).then(async modelResponse => {
                            try {
                                await searchOutput(responsePayload,serverResponse,modelResponse,modelUsed);
                            } catch (error) {
                                console.error('Error processing search output:', error);
                                serverResponse.writeHead(500, {'Content-Type':'application/json'});
                                serverResponse.write(JSON.stringify({error: 'Error processing search results'}));
                                serverResponse.end();
                            }
                        }).catch(error => {
                            console.error('Error calling Claude API:', error);
                            serverResponse.writeHead(500, {'Content-Type':'application/json'});
                            serverResponse.write(JSON.stringify({error: 'Error calling LLM API'}));
                            serverResponse.end();
                        });
                    }
                    else if(modelUsed==="deepseek") {
                        deepseek("search",searchSystemPrompt,messages).then(async modelResponse => {
                            try {
                                await searchOutput(responsePayload,serverResponse,modelResponse,modelUsed);
                            } catch (error) {
                                console.error('Error processing search output:', error);
                                serverResponse.writeHead(500, {'Content-Type':'application/json'});
                                serverResponse.write(JSON.stringify({error: 'Error processing search results'}));
                                serverResponse.end();
                            }
                        }).catch(error => {
                            console.error('Error calling DeepSeek API:', error);
                            serverResponse.writeHead(500, {'Content-Type':'application/json'});
                            serverResponse.write(JSON.stringify({error: 'Error calling LLM API'}));
                            serverResponse.end();
                        });
                    }
                    else if(modelUsed==="openai") {
                        openai("search",searchSystemPrompt,messages).then(async modelResponse => {
                            try {
                                await searchOutput(responsePayload,serverResponse,modelResponse,modelUsed);
                            } catch (error) {
                                console.error('Error processing search output:', error);
                                serverResponse.writeHead(500, {'Content-Type':'application/json'});
                                serverResponse.write(JSON.stringify({error: 'Error processing search results'}));
                                serverResponse.end();
                            }
                        }).catch(error => {
                            console.error('Error calling OpenAI API:', error);
                            serverResponse.writeHead(500, {'Content-Type':'application/json'});
                            serverResponse.write(JSON.stringify({error: 'Error calling LLM API'}));
                            serverResponse.end();
                        });
                    }
                    else if(modelUsed==="local") {
                        local("search",searchSystemPrompt,messages).then(async modelResponse => {
                            try {
                                await searchOutput(responsePayload,serverResponse,modelResponse,modelUsed);
                            } catch (error) {
                                console.error('Error processing search output:', error);
                                serverResponse.writeHead(500, {'Content-Type':'application/json'});
                                serverResponse.write(JSON.stringify({error: 'Error processing search results'}));
                                serverResponse.end();
                            }
                        }).catch(error => {
                            console.error('Error calling local model:', error);
                            serverResponse.writeHead(500, {'Content-Type':'application/json'});
                            serverResponse.write(JSON.stringify({error: 'Error calling LLM API'}));
                            serverResponse.end();
                        });
                    }
                    else {
                        claude("search",searchSystemPrompt,messages).then(async modelResponse => {
                            try {
                                await searchOutput(responsePayload,serverResponse,modelResponse,modelUsed);
                            } catch (error) {
                                console.error('Error processing search output:', error);
                                serverResponse.writeHead(500, {'Content-Type':'application/json'});
                                serverResponse.write(JSON.stringify({error: 'Error processing search results'}));
                                serverResponse.end();
                            }
                        }).catch(error => {
                            console.error('Error calling Claude API:', error);
                            serverResponse.writeHead(500, {'Content-Type':'application/json'});
                            serverResponse.write(JSON.stringify({error: 'Error calling LLM API'}));
                            serverResponse.end();
                        });
                    }
                }
                else {
                    serverResponse.setHeader('Access-Control-Allow-Headers', '*');
                    serverResponse.setHeader('Access-Control-Allow-Origin', '*');
                    serverResponse.writeHead(200,{'Content-Type':'application/json'});
                    serverResponse.write(JSON.stringify('load'));
                    return serverResponse.end();
                }
            });
        }
        else if(reqPath[2]==='discover') {
            req.on('data', (chunk) => {
                b+=chunk;
            });
            req.on('end', () => {
                if(b) {
                    let q=JSON.parse(b)
                    let modelUsed=q.model || "anthropic";
                    let messages=[];
                    let userPrompt="Tell me about this location, latitude:"+q.latitude+", longitude:"+q.longitude;
                    messages.push({role:"user",content:userPrompt});
                    if(modelUsed==="anthropic") {
                        claude("discover",discoverSystemPrompt,messages).then(async modelResponse => {
                            try {
                                await discoverOutput(responsePayload,serverResponse,modelResponse,modelUsed);
                            } catch (error) {
                                console.error('Error processing discover output:', error);
                                serverResponse.writeHead(500, {'Content-Type':'application/json'});
                                serverResponse.write(JSON.stringify({error: 'Error processing discover results'}));
                                serverResponse.end();
                            }
                        }).catch(error => {
                            console.error('Error calling Claude API:', error);
                            serverResponse.writeHead(500, {'Content-Type':'application/json'});
                            serverResponse.write(JSON.stringify({error: 'Error calling LLM API'}));
                            serverResponse.end();
                        });
                    }
                    else if(modelUsed==="deepseek") {
                        deepseek("discover",discoverSystemPrompt,messages).then(async modelResponse => {
                            try {
                                await discoverOutput(responsePayload,serverResponse,modelResponse,modelUsed);
                            } catch (error) {
                                console.error('Error processing discover output:', error);
                                serverResponse.writeHead(500, {'Content-Type':'application/json'});
                                serverResponse.write(JSON.stringify({error: 'Error processing discover results'}));
                                serverResponse.end();
                            }
                        }).catch(error => {
                            console.error('Error calling DeepSeek API:', error);
                            serverResponse.writeHead(500, {'Content-Type':'application/json'});
                            serverResponse.write(JSON.stringify({error: 'Error calling LLM API'}));
                            serverResponse.end();
                        });
                    }
                    else if(modelUsed==="openai") {
                        openai("discover",discoverSystemPrompt,messages).then(async modelResponse => {
                            try {
                                await discoverOutput(responsePayload,serverResponse,modelResponse,modelUsed);
                            } catch (error) {
                                console.error('Error processing discover output:', error);
                                serverResponse.writeHead(500, {'Content-Type':'application/json'});
                                serverResponse.write(JSON.stringify({error: 'Error processing discover results'}));
                                serverResponse.end();
                            }
                        }).catch(error => {
                            console.error('Error calling OpenAI API:', error);
                            serverResponse.writeHead(500, {'Content-Type':'application/json'});
                            serverResponse.write(JSON.stringify({error: 'Error calling LLM API'}));
                            serverResponse.end();
                        });
                    }
                    else if(modelUsed==="local") {
                        local("discover",discoverSystemPrompt,messages).then(async modelResponse => {
                            try {
                                await discoverOutput(responsePayload,serverResponse,modelResponse,modelUsed);
                            } catch (error) {
                                console.error('Error processing discover output:', error);
                                serverResponse.writeHead(500, {'Content-Type':'application/json'});
                                serverResponse.write(JSON.stringify({error: 'Error processing discover results'}));
                                serverResponse.end();
                            }
                        }).catch(error => {
                            console.error('Error calling local model:', error);
                            serverResponse.writeHead(500, {'Content-Type':'application/json'});
                            serverResponse.write(JSON.stringify({error: 'Error calling LLM API'}));
                            serverResponse.end();
                        });
                    }
                    else {
                        claude("discover",discoverSystemPrompt,messages).then(async modelResponse => {
                            try {
                                await discoverOutput(responsePayload,serverResponse,modelResponse,modelUsed);
                            } catch (error) {
                                console.error('Error processing discover output:', error);
                                serverResponse.writeHead(500, {'Content-Type':'application/json'});
                                serverResponse.write(JSON.stringify({error: 'Error processing discover results'}));
                                serverResponse.end();
                            }
                        }).catch(error => {
                            console.error('Error calling Claude API:', error);
                            serverResponse.writeHead(500, {'Content-Type':'application/json'});
                            serverResponse.write(JSON.stringify({error: 'Error calling LLM API'}));
                            serverResponse.end();
                        });
                    }
                }
                else {
                    serverResponse.setHeader('Access-Control-Allow-Headers', '*');
                    serverResponse.setHeader('Access-Control-Allow-Origin', '*');
                    serverResponse.writeHead(200,{'Content-Type':'application/json'});
                    serverResponse.write(JSON.stringify('load'));
                    return serverResponse.end();
                }
            });
        }
    }
});

server.listen(process.env["PORT"]);
console.log('Godview running on port '+process.env["PORT"]);

// Add error handler for the server
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`⚠️ Port ${process.env["PORT"]} is already in use. Please try a different port.`);
        console.log('You can change the port in your .env file or kill the process using this port.');
        process.exit(1);
    } else {
        console.error('Server error:', error);
        process.exit(1);
    }
});