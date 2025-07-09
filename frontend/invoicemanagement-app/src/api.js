import axios from 'axios'  // connection libray were we are able to connect react application to out fastapi application

const api = axios.create({
    baseURL: 'http://localhost:8000', // base URL of our fastapi application
})

export default api;