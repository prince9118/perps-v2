"use client"
import { useState } from "react";
import { useRouter } from "next/navigation"; 
import { apiFetch } from "@/lib/api"; 
export default function SignupPage(){
    const router=useRouter();
    const [email,setEmail]=useState("");
    const [password,setPassword]=useState("");

    async function handleSignup(){
        const res=await apiFetch("/auth/signup",{
            method:"POST",
            body:JSON.stringify({email,password}),
        });
        if(res.token){
            localStorage.setitem("token",res.token);
            router.push("/trade/BTC-PERP");
        }else{
            alert(res.message||"Signup Failed");
        }
    }
    return(
        <div className="flex h-screen item-center justify-center">
            <div className="flex flex-col gap-3 w-80">
                <h1 className="text-xl font-bold">SignUp</h1>
                <input 
                className="border p-2"
                placeholder="Email"
                value={email}
                onChange={(e)=>setEmail(e.target.value)}
                />
                <input 
                className="border p-2"
                type="password"
                placeholder="password"
                value={password}
                onChange={(e)=>setPassword(e.target.value)}
                />
                <button
                className="bg-black text-white p-2"
                onClick={handleSignup}
                >
                    SignUp
                </button>

            </div>

        </div>
    );
}
