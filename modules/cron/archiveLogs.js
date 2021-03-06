/**
 * @file modules/cron/archiveLogs.js
 * @author GPlay97
 * @description Cron file to archive logs for users in background
 */
const http = require('http');
const srv_config = require('./../../srv_config.json');
const db = require('./../db');
const query = db.query;

http.createServer().listen(srv_config.CRON_ARCHIVE_PORT);

const archiveLogs = () => {
    return new Promise((resolve, reject) => {
        query('SELECT * FROM logs WHERE archived=0 AND autogenerated=1 ORDER BY start ASC LIMIT 100', null, (err, logsRes) => {
            if (!err && Array.isArray(logsRes)) {
                let processed = 0;

                if (!logsRes.length) return resolve();

                const processLog = (log) => {
                    console.log('Process log', processed);
                    const table = `statistics_${new Date(log.start * 1000).getMonth() + 1}_${new Date(log.start * 1000).getFullYear()}`;

                    query(`CREATE TABLE IF NOT EXISTS ${table} LIKE statistics`, null, (err) => {
                        if (err) return reject(err);
                        query('SELECT * FROM statistics WHERE akey=? AND timestamp >= ? AND timestamp <= ?', [log.akey, log.start, log.end], (err, stats) => {
                            if (!err && Array.isArray(stats)) {
                                if (!stats.length) {
                                    query('UPDATE logs SET archived=1 WHERE id=?', [log.id], (err) => {
                                       if (err) return reject(err);
                                       if (++processed === logsRes.length) return resolve();
                                       processLog(logsRes[processed]);
                                   });
                                } else {
                                    query(`INSERT INTO ${table} (${Object.keys(stats[0]).join(',')}) VALUES ?`, [stats.map((stat) => Object.values(stat))], (err) => {
                                        if (err) return reject(err);
                                        query('DELETE FROM statistics WHERE akey=? AND timestamp >= ?  AND timestamp <= ?', [log.akey, log.start, log.end], (err) => {
                                           if (err) return reject(err);
                                           query('UPDATE logs SET archived=1 WHERE id=?', [log.id], (err) => {
                                               if (err) return reject(err);
                                               if (++processed === logsRes.length) return resolve();
                                               processLog(logsRes[processed]);
                                           });
                                        });
                                    });
                                }
                            } else reject(err);
                        });
                    });
                };

                processLog(logsRes[processed]);
            } else reject(err);
        });
    });
};

if (require.main === module) {
    archiveLogs().then(console.log).catch(console.error).then(() => {
        db.close(() => {
            process.exit();
        });
    });
} else {
    exports.archiveLogs = archiveLogs;
}
