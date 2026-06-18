"use client"
import {useState} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

export default function LoginPage(){
    const router=useRouter();
    const setUser=useAuthStore((s)=>s.setUser);
    const [email,setEmail]=useState("");
    const [password,setPassword]=useState("");
    const [error,setError]=useState("");
    const [loading,setLoading]=useState(false);
    async function handleSubmit(e:React.FormEvent){
        e.preventDefault();
        setError("");
        setLoading(true);
        try{
            const res=await authApi.login(email,password);
            setUser(res.data.user,res.data.token);
            router.push("/trade/BTC-PERP");
        }catch(err:unknown){
            const message=err instanceof Error? err.message:"Invalid email or password";
            setError(message);
        }finally{
            setLoading(false);
        }
    }
    return(
        <div className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-sm">
                <h1>Login To Perps V2</h1>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-sm text-grey-400">Email</label>
                        <input
                        type="email"
                        value={email}
                        onChange={(e)=>setEmail(e.target.value)}
                        className="bg-grey-800 border border-grey-700 rounded px-3 text-white focus:outline-none focus:border-blue-500"
                        placeholder="emal@gmail.com"
                        required
                        />
                    </div>
                     <div className="flex flex-col gap-1">
                        <label className="text-sm text-grey-400">Password</label>
                        <input
                        type="password"
                        value={password}
                        onChange={(e)=>setPassword(e.target.value)}
                        className="bg-grey-800 border border-grey-700 rounded px-3 text-white focus:outline-none focus:border-blue-500"
                        placeholder="........."
                        required
                        />
                    </div>
                    {
                        error && (
                            <p className="text-red-400 text-sm">{error}</p>
                        )
                    }
                    <button 
                        type="submit"
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-900 disabled:opacity-50 disable:cursor-not-allowed text-white font-semibold py-2 rounded transition-colors"
                    >
                        {loading?"Logging in ....":"Login"}

                    </button>

                </form>
                <p className="text-center text-gray-400 text-sm mt-6">
                    No account?{" "}
                    <Link href="/signup" className="text-blue-400 hover:underline">
                        Sign up
                    </Link>
                </p>
            </div>
        </div>
    )




}