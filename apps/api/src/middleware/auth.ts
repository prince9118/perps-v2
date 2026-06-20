import jwt from 'jsonwebtoken';

export function authMiddleware(req:any,res:any,next:any){
    const authHeader=req.headers.authorization;
    if(!authHeader){
        return res.status(401).json({
            message:"Authirization header missing "
        });
    }
    // // console.log(authHeader);
    const token=authHeader.split(" ")[1];
    if(!token){
        return res.status(401).json({
            message:"Token Missing"
        });
    }
    try{
        const decoded= jwt.verify(token,process.env.JWT_SECRET!)as {
            userId:string;
            email:string;
        };
        req.user=decoded;
        next();
    }catch{
        return res.status(401).json({
            message:"Invalid Token"
        });
    }

}