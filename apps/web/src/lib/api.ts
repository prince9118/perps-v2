export const API_URL="http://localhost:3000";

export async function apiFetch(
    path:string,
    options:RequestInit ={}

){
    const token=localStorage.getItem("token");
    const res=await fetch(`${API_URL}${path}`,{
        ...options,
        headers:{
            "Content-Type":"application/json",
            ...(token?{Authorization:`Bearer ${token}`}:{}),
            ...options.headers,
        },
    });
    return res.json();
}