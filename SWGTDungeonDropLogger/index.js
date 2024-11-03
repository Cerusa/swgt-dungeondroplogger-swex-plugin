const request = require('request');
const fs = require('fs');
const path = require('path');

const version = '1.0.0';
const pluginName = 'SWGTDungeonDropLogger';
const siteURL = 'http://local.swgt.io';'https://swgt.io';

module.exports = {
    pluginName,
    version,
    autoUpdate: {
        versionURL: 'https://swgt.io/staticContent/SWGTDungeonDropLogger.yml'
    },
    defaultConfig: {
        enabled: true,
        saveToFile: false
    },
    defaultConfigDetails: {
        saveToFile: { label: 'Save to file as well?' }
    },
    pluginDescription: 'This plugin sends dungeon item drops to SWGT for analytics. All data is anonymized.',
    init(proxy, config) {

        var listenToCommands = [
            'BattleDungeonResult_V2',
            'BattleDimensionHoleDungeonResult',
            'BattleDimensionHoleDungeonResult_v2',
            'BattleRiftDungeonResult'
        ];

        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: "Listening to commands: " + listenToCommands.toString().replace(/,/g, ', ') });

        for (var commandIndex in listenToCommands) {
            var command = listenToCommands[commandIndex];
            proxy.on(command, (req, resp) => {
                //Clone for usage
                var cloneReq = JSON.parse(JSON.stringify(req)); //clone to ensure global object not modified for other plugins
                var cloneResp = JSON.parse(JSON.stringify(resp)); //clone to ensure global object not modified for other plugins

                this.processRequest(command, proxy, config, cloneReq, cloneResp);
            });
        }

        //Confirm SWGT plugin version
        this.checkVersion(proxy, config);
    },

    processRequest(command, proxy, config, req, resp) {
        if (resp.command == 'BattleDungeonResult_V2' || resp.command == 'BattleDimensionHoleDungeonResult' || resp.command == 'BattleDimensionHoleDungeonResult_v2') {
            if('win_lose' in req && req.win_lose == 0){
                proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Skipping because battle was not a win`});
                return;
            }

            var customPacket = {};
            customPacket.command =  resp.command;
            customPacket.dungeon_id = 0;
            customPacket.stage_id = 0;
            customPacket.mana_amount = 0;
            customPacket.crystal_amount = 0;
            customPacket.energy_amount = 0;
            customPacket.items = [];

            if ('dungeon_id' in req)
                customPacket.dungeon_id = req.dungeon_id;
            if('stage_id' in req){
                customPacket.stage_id = req.stage_id;
            }else{
                if('difficulty' in req)
                    customPacket.stage_id = req.difficulty;
            }
            if ('ts_val' in resp)
                customPacket.ts_val = resp.ts_val;
            if ('tvalue' in resp)
                customPacket.tvalue = resp.tvalue;
            if ('tvaluelocal' in resp)
                customPacket.tvaluelocal = resp.tvaluelocal;
            if ('tzone' in resp)
                customPacket.tzone = resp.tzone;
            if ('server_id' in resp)
                customPacket.server_id = resp.server_id;
            if ('server_endpoint' in resp)
                customPacket.server_endpoint = resp.server_endpoint;
            if ('swex_version' in resp)
                customPacket.swex_version = resp.swex_version;

            if ('reward' in resp) {
                if ('mana' in resp.reward)
                    customPacket.mana_amount = resp.reward.mana;
                if ('crystal' in resp.reward)
                    customPacket.crystal_amount = resp.reward.crystal;
                if ('energy' in resp.reward)
                    customPacket.energy_amount = resp.reward.energy;
            }

            if ('changed_item_list' in resp) {
                for (var i = 0; i < resp.changed_item_list.length; i++) {
                    var changed_item = JSON.parse(JSON.stringify(resp.changed_item_list[i]));

                    if('view' in changed_item){
                        if('rune_set_id' in changed_item.view){ //Rune
                            if('info' in changed_item && 'slot_no' in changed_item.info)
                                changed_item.view.rune_slot_id = changed_item.info.slot_no;
    
                            if('info' in changed_item && 'pri_eff' in changed_item.info)
                                changed_item.view.rune_pri_eff = changed_item.info.pri_eff;
    
                            if('info' in changed_item && 'prefix_eff' in changed_item.info && Array.isArray(changed_item.info.prefix_eff))
                                changed_item.view.rune_prefix_eff = changed_item.info.prefix_eff;
                        }
    
                        if('artifact_type' in changed_item.view){ //Artifact
                            if('info' in changed_item && 'pri_effect' in changed_item.info)
                                changed_item.view.artifact_pri_effect = changed_item.info.pri_effect;
                        }
    
                        customPacket.items.push(changed_item.view);
                    }
                }
            }
            if (customPacket.dungeon_id == 0){
                proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Skipping because dungeon_id is 0`});
                return;
            }
            
            this.writeToFile(proxy, config, req, resp, customPacket);
            this.uploadToWebService(proxy, config, customPacket);
        }

        if(resp.command == 'BattleRiftDungeonResult'){
            if('battle_result' in req && req.battle_result == 0){
                proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Skipping because battle was not a win`});
                return;
            }
            
            var customPacket = {};
            customPacket.command =  resp.command;
            customPacket.dungeon_id = 0;
            customPacket.rift_dungeon_box_id = 0;

            customPacket.item_list = [];
            customPacket.changed_item_list = [];

            if ('dungeon_id' in req)
                customPacket.dungeon_id = req.dungeon_id;
            if('rift_dungeon_box_id' in resp)
                customPacket.rift_dungeon_box_id = resp.rift_dungeon_box_id;
            if ('ts_val' in resp)
                customPacket.ts_val = resp.ts_val;
            if ('tvalue' in resp)
                customPacket.tvalue = resp.tvalue;
            if ('tvaluelocal' in resp)
                customPacket.tvaluelocal = resp.tvaluelocal;
            if ('tzone' in resp)
                customPacket.tzone = resp.tzone;
            if ('server_id' in resp)
                customPacket.server_id = resp.server_id;
            if ('server_endpoint' in resp)
                customPacket.server_endpoint = resp.server_endpoint;
            if ('swex_version' in resp)
                customPacket.swex_version = resp.swex_version;

            if('item_list' in resp){
                for (var i = 0; i < resp.item_list.length; i++) {
                    var item = JSON.parse(JSON.stringify(resp.item_list[i]));

                    if('info' in item && 'unit_id' in item.info){
                        //Monster
                        item.monster_unit_class = item.info.class;
                        item.monster_unit_level = item.info.unit_level;
                    }

                    customPacket.item_list.push(item);
                }
            }

            if ('changed_item_list' in resp) {
                for (var i = 0; i < resp.changed_item_list.length; i++) {
                    var changed_item = JSON.parse(JSON.stringify(resp.changed_item_list[i]));

                    if('view' in changed_item){
                        if('rune_set_id' in changed_item.view){ //Rune
                            if('info' in changed_item && 'slot_no' in changed_item.info)
                                changed_item.view.rune_slot_id = changed_item.info.slot_no;
    
                            if('info' in changed_item && 'pri_eff' in changed_item.info)
                                changed_item.view.rune_pri_eff = changed_item.info.pri_eff;
    
                            if('info' in changed_item && 'prefix_eff' in changed_item.info && Array.isArray(changed_item.info.prefix_eff))
                                changed_item.view.rune_prefix_eff = changed_item.info.prefix_eff;
                        }
    
                        if('artifact_type' in changed_item.view){ //Artifact
                            if('info' in changed_item && 'pri_effect' in changed_item.info)
                                changed_item.view.artifact_pri_effect = changed_item.info.pri_effect;
                        }
    
                        customPacket.changed_item_list.push(changed_item.view);
                    }
                }
            }
            if (customPacket.dungeon_id == 0){
                proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Skipping because dungeon_id is 0`});
                return;
            }
            
            this.writeToFile(proxy, config, req, resp, customPacket);
            this.uploadToWebService(proxy, config, customPacket);
        }

        cloneReq = {};
        cloneResp = {};
    },

    uploadToWebService(proxy, config, jsonPacket) {
        const { command } = jsonPacket;
        jsonPacket.pluginVersion = version;
        var endpoint = "/api/dungeondroplogger/v1";

        let options = {
            method: 'post',
            uri: siteURL + endpoint,
            json: true,
            body: jsonPacket
        };

        request(options, (error, response) => {
            if (error) {
                proxy.log({ type: 'error', source: 'plugin', name: this.pluginName, message: `Error: ${error.message}` });
                return;
            }

            if (response.statusCode === 200) {
                proxy.log({ type: 'success', source: 'plugin', name: this.pluginName, message: `${command} uploaded successfully` });
            } else {
                proxy.log({
                    type: 'error',
                    source: 'plugin',
                    name: this.pluginName,
                    message: `${command} upload failed: Server responded with code: ${response.statusCode} = ${response.body.message} for ${command}`
                });
            }
        });
    },
    checkVersion(proxy) {
        //check version number
        var endpoint = "/api/dungeondroplogger/v1";
        let options = {
            method: 'get',
            uri: siteURL + endpoint
        };
        request(options, (error, response) => {
            if (error) {
                proxy.log({ type: 'error', source: 'plugin', name: this.pluginName, message: `Error: ${error.message}` });
                return;
            }
            //Check current version of SWGT Plugin as listed on site.
            if (response.statusCode === 200) {
                versionResponse = JSON.parse(response.body);
                if (versionResponse.message == version) {
                    proxy.log({
                        type: 'success', source: 'plugin', name: this.pluginName,
                        message: `Initializing version ${pluginName}_${version}. You have the latest version!`
                    });
                } else {
                    proxy.log({
                        type: 'warning', source: 'plugin', name: this.pluginName,
                        message: `Initializing version ${pluginName}_${version}. There is a new version available on GitHub. Please visit https://github.com/Cerusa/swgt-dungeondroplogger-swex-plugin/releases and download the latest version.`
                    });
                }
            } else {
                proxy.log({
                    type: 'error',
                    source: 'plugin',
                    name: this.pluginName,
                    message: `Server responded with code: ${response.statusCode} = ${response.body}`
                });
            }
        });
    },
    writeToFile(proxy, config, req, resp, jsonPacket) {
        jsonPacket.pluginVersion = version;

        if (!config.Config.Plugins[pluginName].enabled) return;
        if (!config.Config.Plugins[pluginName].saveToFile) return;

        let filename = this.pluginName + '-' + jsonPacket.command + '-' + new Date().getTime() + '.json';
        let outFile = fs.createWriteStream(path.join(config.Config.App.filesPath, filename), {
            flags: 'w',
            autoClose: true
        });

        outFile.write(JSON.stringify(jsonPacket, true, 2));
        outFile.end();
        proxy.log({ type: 'success', source: 'plugin', name: this.pluginName, message: 'Saved data to '.concat(filename) });
    }
};