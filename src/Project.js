var Process = require("child_process");
var Chalk = require("chalk");
const Path = require("path");
const Fs = require("fs");


var Logger = require("./Logger.js");
var Configuration = require("./Configuration.js");
var Analyzer = require("./Analyzer.js");
var AnalysisHelper = require("./AnalysisHelper.js");
var Finder = require("./Finder.js");
var DeviceManager = require("./DeviceManager.js");
var PackagePatcher = require("./PackagePatcher.js");
//var ut = require("./Utils.js");
//var Backup = require("./BackupManager.js");
var HookHelper = require("./HookManager.js");
var DexHelper = require("./DexHelper.js");
var InspectorManager = require("./InspectorManager.js");
var Workspace = require("./Workspace.js");
var WebServer = require("./WebServer.js");
var DataAnalyzer = require("./DataAnalyzer.js");
const AndroidAppAnalyzer = require("./AndroidAppAnalyzer.js");
var GraphMaker = require("./Graph.js");
var Bus = require("./Bus.js");
var Event = require("./Event.js");
var ApkHelper = require("./ApkHelper.js");
var FridaGenerator = require("./FridaGenerator.js");
const Platform = require("./Platform.js");
const SYSCALLS = require("./Syscalls.js");
//const CONFIG = require("../config.js");


var g_builtinHookSets = {};
/*
    RootDetection: require("./scanner/RootDetection.js"),
    Deobfuscater: require("./scanner/Deobfuscater.js"),
    KeystoreScanner: require("./scanner/KeystoreScanner.js")
};*/

/**
 * Represents an instance of a running application.
 * It can be used in order to pause/resume an application running on a remote device. 
 * @param {int} pid The Remote PID of the application 
 * @constructor
 */
function ApplicationInstance(pid){
    this.pid = null;
}


function importConfig(cfg){
    for(let i in cfg.platform_available){
        cfg.platform_available[i] = new Platform(cfg.platform_available[i]); 
    }
    return cfg;
}

/**
 * Represents the project, the current configuration and all the context.
 *   
 * @param {string} pkgName The name of the Application package name to analyze
 * @param {string} scanDir Optional , the path to the bytecode directory to scan. If it sets, the scan start immediately.
 * @constructor
 */
function Project(pkgName, cfgpath=null, nofrida=0){
    this.initDexcalibur(pkgName,cfgpath,nofrida);
}

Project.prototype.initDexcalibur = function(pkgName, cfgpath=null, nofrida=0, apiVersion="android:7.0.0"){
    this.pkg = pkgName;
    this.config = new Configuration();
    this.cfgpath = cfgpath;
    this.nofrida = nofrida;
    this.apiVersion = apiVersion;
    var _self = this;

    if(cfgpath != null){
        this.config.import(require(cfgpath), true, true);
        //this.config = importConfig(require(cfgpath));
        Logger.info(" Given configuration file loaded");
    }else{
        //let cfg = require("../config.js");
        this.config.import(require("../config.js"), true, true);
        
        //this.config = importConfig(cfg);
        Logger.info(" Default configuration loaded from 'config.js' file.");
    }
    this.config.dexcaliburPath = Path.join(process.cwd(),"src");
    
    // set the Search API which allow the user to perform search
    this.find = new Finder.SearchAPI();

    // set SC analyzer 
    this.analyze = new Analyzer(this.config.encoding, this.find, this);
    // set syscall list (bionic) 
    this.analyze.useSyscalls(SYSCALLS);
    this.analyze.addTagCategory(
        "hash",
        ["md5","sha1","sha256","sha512"]
    );
    this.analyze.addTagCategory(
        "key",
        ["256","1024","2048","4096"]
    );


    this.apkHelper = new ApkHelper(this);

    // dex helper
    this.dexHelper = new DexHelper(this);

    // ste Device Manager
    this.devices = new DeviceManager(this.config);

    //package Patcher
    this.packagePatcher = new PackagePatcher(pkgName, this.config, this.apkHelper);

    // hook
    this.hook = new HookHelper.Manager(this, nofrida);
    this.hook.refreshScanner();

    // set the workspace API
    this.workspace = new Workspace(pkgName,this.config);

    // setup web server
    this.web = new WebServer(this);

    // setup File Analyzer
    this.dataAnalyser = new DataAnalyzer.Analyzer(this);

    this.bus = Bus.Event.setContext(this);

    this.appAnalyzer = new AndroidAppAnalyzer(this);

    this.inspectors = new InspectorManager(this);

    let insp = null;

    this.inspectors.autoRegister();

    // auto deploy all inspectors
    /*ut.forEachFileOf(this.config.dexcaliburPath+"/inspectors/", function(path,file){
        insp = require(path).injectContext(_self);
        // subscribe to event bus
        mainBus.subscribe(insp);
        mainInsp.push(insp);
        // deploy conteined hookset
        //insp.deploy();
    },true);*/

    // FridaBuilder make Frida script chunk from cls
    this.fridaBuilder = new FridaGenerator(this);

    // 
    this.graph = new GraphMaker(this);
    

    // smali patcher
    /*
    this.patcher = {
        > var patch = project.patch.new()
        > patch.strings("SHA-1").with("MD5").build()
        > patch.install()
    }
    */


    console.log("\n\n"
    +"███████╗ ███████╗██╗  ██╗ ██████╗ █████╗ ██╗     ██╗██████╗ ██╗   ██╗██████╗\n" 
    +"██╔═══██╗██╔════╝╚██╗██╔╝██╔════╝██╔══██╗██║     ██║██╔══██╗██║   ██║██╔══██╗\n"
    +"██║   ██║█████╗   ╚███╔╝ ██║     ███████║██║     ██║██████╔╝██║   ██║██████╔╝\n"
    +"██║   ██║██╔══╝   ██╔██╗ ██║     ██╔══██║██║     ██║██╔══██╗██║   ██║██╔══██╗\n"
    +"███████╔╝███████╗██╔╝ ██╗╚██████╗██║  ██║███████╗██║██████╔╝╚██████╔╝██║  ██║\n"
    +"╚══════╝ ╚══════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝╚═════╝  ╚═════╝ ╚═╝  ╚═╝\n"
    +" v0.1                                                          by @FrenchYeti \n"
    +"╔════════════════════════════════════════════════════════════════════════════╗\n"
    +"║ How to use ?                                                               ║\n"
    +"║ > const Dexcalibur = require('./src/Project.js')                               ║\n"
    +"║ > var project = new Dexcalibur('com.example.test')                         ║\n"
    +"║ > project.scan()                                                           ║\n"
    +"║ > project.find.invoke('calleed.name:loadLibrary')                          ║\n"
    +"║                                                                            ║\n"
    +"║ Read *.help() ! =)                                                         ║\n"
    +"╚════════════════════════════════════════════════════════════════════════════╝\n"
    );

    this.workspace.init();
}



Project.prototype.changeProject = function(packageIdentifier) {
    this.initDexcalibur(packageIdentifier,this.cfgpath,this.nofrida);
    this.useAPI(this.apiVersion).fullscan();
};


Project.prototype.getDataAnalyzer = function(){
    return this.dataAnalyser;
};


Project.prototype.getAppAnalyzer = function(){
    return this.appAnalyzer;
};


Project.prototype.getAnalyzer = function(){
    return this.analyze;
};

/**
 * To show available APIs (console print)
 * 
 */
Project.prototype.showAPIs = function(){
    for(let i=0 ;i<this.config.platform_available.length ; i++){
        console.log(this.config.platform_available[i].name);
    }
    return this;
};

/**
 * To specify the Android API version to use in the map.
 * It should be write according to the format in "config.platform_available"
 * @param {string} version The version of the API  
 * @function
 */
Project.prototype.useAPI = function(version){
    this.config.platform_target = version;
    return this;
};



/**
 * To perform a scan of the application byetcode only.
 * All reference to Android system classes will be tagged MissingReference or VMBinding
 * @param {string} path Optional, the path of the folder containing the decompiled smali code. 
 * @returns {Project} Returns the instance of this project
 * @function
 */
Project.prototype.scan = function(path){
    // make IR 
    if(path !== undefined){   
        this.analyze.path( path);
    }else{
//        let dexPath = this.workspace.getWD()+"dex";
        let dexPath = Path.join(this.workspace.getWD(),"dex");
        console.log( Chalk.yellow("Scanning default path : "+dexPath));
        this.analyze.path( dexPath);
        this.dataAnalyser.scan( dexPath);
        this.analyze.insertFiles( this.dataAnalyser.getDB, false);
    }
};



/**
 * To perform a scan of the set of files.
 * @param {string} path Optional, the path of the folder containing the decompiled smali code. 
 * @returns {Project} Returns the instance of this project
 * @function
 * @deprecated
 */
Project.prototype.scanForFiles = function(path){

    if(path == null){   
        console.log(Chalk.bold.red("Invalid files path"));
        return null;
    }

    let files = this.dataAnalyzer.scan(path);
    
    this.analyze.updateFiles(files.getDb().getFiles());
    this.analyze.updateBuffers(files.getDb().getBuffers());
    
    return this;
};

/**
 * To perform a fullsacn of the application. It  performs :
 *      - Android API bytecode scan (for the specified API version - by default it's API 25)
 *      - Application bytecode scan
 *      - Application package scan
 * @param {string} path Optional, the path of the folder containing the decompiled smali code. 
 * @returns {Project} Returns the instance of this project
 * @function
 */
Project.prototype.fullscan = function(path){
    // scan OS
    console.log(Chalk.yellow("Scanning platform "+this.config.platform_target));
    //this.config.getTargetPlatform().getBinPath();
    //this.analyze.path()
    this.analyze.path(this.config.getTargetPlatformPath());

    this.analyze.updateDataBlock();    

    this.analyze.tagAllAsInternal();

    //this.analyze.path(this.config.platform_available[this.config.platform_target].getBinPath());

    // scan files  
    if(path !== undefined){   
        this.analyze.path( path);
        this.dataAnalyser.scan( path, ["smali"]);
        
       // this.analyze.scanManifest(Path.join(path,"AndroidManifest.xml"));
        this.appAnalyzer.importManifest(Path.join(path,"AndroidManifest.xml"));
    }else{
        //        let dexPath = this.workspace.getWD()+"dex";
        let dexPath = Path.join(this.workspace.getWD(),"dex");

        console.log(Chalk.yellow("Scanning default path : "+dexPath));
        
        this.analyze.path( dexPath);
        this.dataAnalyser.scan( dexPath, ["smali"]);
//        this.analyze.scanManifest(Path.join(dexPath,"AndroidManifest.xml"));
        this.appAnalyzer.importManifest(Path.join(dexPath,"AndroidManifest.xml"));
    }




    // index static array 
    this.analyze.updateDataBlock();    

    this.analyze.tagAllIf(
        function(k,x){ 
            return x.hasTag(AnalysisHelper.TAG.Discover.Internal)==false; 
        }, 
        AnalysisHelper.TAG.Discover.Statically);


    // scan bytecode gathered during previous instrumentation session
    if(path == null){

        let dir=Fs.readdirSync(this.workspace.getRuntimeBcDir());
        for(let i in dir){
            elemnt = Path.join(this.workspace.getRuntimeBcDir(),dir[i],"smali");
            if(Fs.lstatSync(elemnt).isDirectory()){
                console.log(Chalk.yellow("Scanning previously discovered dex chunk : "+elemnt));
                this.analyze.path(elemnt);
            }
        }  


        this.analyze.tagAllIf(
            function(k,x){ 
                return (x.hasTag(AnalysisHelper.TAG.Discover.Internal)==false) 
                    && (x.hasTag(AnalysisHelper.TAG.Discover.Statically)==false); 
            }, 
            AnalysisHelper.TAG.Discover.Dynamically);
        
        this.dataAnalyser.scan(this.workspace.getRuntimeFilesDir());
    }

    this.bus.send(new Event.Event({
        type: "dxc.fullscan.post" 
    }));

    // deploy inspector's hooksets
    this.inspectors.deployAll();
    
    // trigger event
    this.bus.send(new Event.Event({
        type: "dxc.appview.new" 
    }));

    this.analyze.insertIn( "files", this.dataAnalyser.getDB().getFiles());
    
    this.bus.send(new Event.Event({
        type: "filescan.new" 
    }));

    // make CFG
    //this.analyze.cfg();
    return this;
};

Project.prototype.trigger = function(eventData){
    this.bus.send(new Event.Event(eventData));
}

// Make a backup of the project 
/*
Project.prototype.saveDB = function(file){
    if(file===undefined){
        return Backup.save(this.analyze.db,this.workspace.getNewSavefilePath());
    }else{
        return Backup.save(this.analyze.db,file);
    }
}

// Load a backup
/*
Project.prototype.loadDB = function(savePath){
    //this.analyze.db = Backup.restore(savePath);
    return Backup.restore(savePath);
}*/

/**
 * To download the Application package from the default device, 
 * uncompress the package, and disassemble the application bytecode 
 * to smali code.  
 * @param {Device} device NOT USED
 * @return {*} TBD
 * @function
 */
Project.prototype.pull = function(device){
    let adb=this.config.adbPath, ret="", path="", i=0;
    
    if(this.config.useEmulator) adb+=" -e";
    
    if(device===null || this.devices.hasNotDefault()){
        console.log(Chalk.bold.yellow("[!] Warning ! : device not selected. Searching ..."));
        this.devices.scan();
        if(this.devices.count==0){
            console.log(Chalk.bold.red("[E] No device found"));
            return "";
        }
        else if(this.devices.count==1){
            console.log(Chalk.bold.green("[*] Device selected : "+this.devices.getDefault().id));
        }
        else if(this.devices.count>1){
            console.log(Chalk.bold.yellow("[!] Please choose a device above with *.devices.setDefault(<id>)"));
            return "";
        }
    }

    if(!this.config.useEmulator && this.devices.getDefault()!==null) 
        adb+=" -s "+this.devices.getDefault().id;

    ret = Process.execSync(adb+" shell pm list packages -f").toString("ascii");
    
    if(ret.indexOf(this.pkg)==-1){
        console.error(Chalk.bold.yellow("[!] Package not found"));
        return null;
    }

    ret = ret.split("\n");
    let t=null,ppath=null;
    for(let i in ret){
        if(ret[i].indexOf(this.pkg)>-1){
            
            t = ret[i].indexOf(":");
            ppath = ret[i].substr(t+1,ret[i].lastIndexOf("=")-t-1);
            break;
        }
    } 

    if(typeof ppath !== 'string'){
        console.error(Chalk.bold.yellow("[!] Package not found"));
        return "";
    }else{
        console.log(Chalk.bold.green("[*] Package found"));
    }
        
    //let pathWD = this.workspace.getWD()+this.pkg;
    let pathWD = Path.join(this.workspace.getWD(),this.pkg);
    let dexPath = Path.join(this.workspace.getWD(),"dex");

    try {
        Process.execSync(adb+" pull "+ppath+" "+pathWD+".apk");
        console.log(Chalk.bold.green("[*] Package downloaded to "+pathWD+".apk"));

        ret = Process.execSync(this.config.apktPath+" d -f -m -o "+dexPath+" "+pathWD+".apk").toString("ascii");
        console.log(Chalk.bold.green("[*] APK decompiled in "+dexPath));
    }
    catch(exception) {
        console.error(Chalk.bold.red("[!] Failed to pull package:"));
        console.error(exception);
    }
};


Project.prototype.useEmulator = function(){
    this.config.useEmulator = true;
}

/**
 * To start the application from a specific Activity.
 * Use the default device. It can used in order to force application crawl. 
 * @param {string} activity The activity to start
 * @returns {ApplicationInstance}  A reference to the process running the Application
 * @function 
 */
Project.prototype.start = function(activity){
    let adb=this.config.adbPath, ret="", path="", i=0;
    
    if(this.config.useEmulator) sdb+=" -e";
    if(this.config.deviceId!=null) adb+=" -s "+this.config.deviceId;
    
    ret = Process.execSync(adb+" shell am start "+this.pkg+"/"+activity).toString("ascii");

    
    return new ApplicationInstance(0);
};


Project.prototype.startWebserver = function(port=null){
    // if port is undefined or null
    if(port==null){
        this.web.start(this.config.getWebPort());
    }else{
        this.web.start(port);
    }
}
/*
Project.prototype.saveDB = function(){
    let sys_db = this.dbm.getPlatformDB();
    sys
};*/

module.exports = Project;
