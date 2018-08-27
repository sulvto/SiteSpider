/**
 * Created by sulvto on 18-8-24.
 */


function DB( storeName, keyPath) {
    var hasError = false;
    var successed = false;
    keyPath = keyPath || "id";

    var version = "1.0";

    window.indexedDB.open(storeName, version).onupgradeneeded = function (event) {
        var db = event.target.result;
        if (!db.objectStoreNames.contains(storeName)) {
            var objectStore = db.createObjectStore(storeName, {keyPath: keyPath});
            //objectStore.createIndex('name', 'name', {unique: false});
        }
    };

    var request = window.indexedDB.open(storeName, version);

    request.onerror = function (event) {
        console.error(event.target.error);
        hasError = true;
    };

    request.onsuccess = function (event) {
        successed = true;
    };


    return {
        getDb: function (callback) {
            if (successed) {
                try {
                    callback(null, request.result);
                } catch (error) {
                    callback(error);
                }
            } else if (!hasError) {
                var that = this;
                setTimeout(function () {
                    that.getDb(callback)
                }, 300);
            } else {
                callback(hasError);
            }
        },

        add: function (data, callback) {
            this.getDb(function (hasError, db) {
                if (!hasError) {
                    var request = db.transaction([storeName], 'readwrite')
                        .objectStore(storeName)
                        .add(data);

                    request.onsuccess = function (event) {
                        callback();
                    };

                    request.onerror = function (event) {
                        callback(event.target.error);
                    }
                } else {
                    callback(hasError);
                }
            });
        },

        save: function (data, callback) {
            var that = this;
            that.read(data[keyPath], function (error, result) {
                if (error) {
                    callback(error);
                } else if (result) {
                    // update
                    that.update(data, callback);
                } else {
                    // add
                    that.add(data, callback);
                }
            })
        },

        read: function (key, callback) {
            this.getDb(function (hasError, db) {
                if (!hasError) {
                    var transaction = db.transaction([storeName]);
                    var objectStore = transaction.objectStore(storeName);
                    var request = objectStore.get(key);

                    request.onerror = function (event) {
                        callback(event.target.error);
                    };

                    request.onsuccess = function (event) {
                        callback(null, request.result);
                    };
                } else {
                    callback(hasError);
                }
            })
        },

        readAll: function (callback) {
            this.getDb(function (hasError, db) {
                if (!hasError) {
                    var objectStore = db.transaction([storeName]).objectStore(storeName);

                    var openCursor = objectStore.openCursor();

                    var arr = [];

                    openCursor.onsuccess = function (event) {
                        var result = event.target.result;

                        if (result) {
                            arr.push(result.value);

                            result.continue();
                        } else {
                            callback(null, arr);
                        }
                    };
                } else {
                    callback(hasError);
                }
            })
        },

        update: function (data, callback) {
            this.getDb(function (hasError, db) {
                if (!hasError) {

                    var request = db.transaction([storeName], 'readwrite')
                        .objectStore(storeName)
                        .put(data);

                    request.onsuccess = function (event) {
                        callback();
                    };

                    request.onerror = function (event) {
                        callback(event.target.error);
                    }
                } else {
                    callback(hasError);
                }
            });
        },


        remove: function (key, callback) {
            this.getDb(function (hasError, db) {
                if (!hasError) {

                    var request = db.transaction([storeName], 'readwrite')
                        .objectStore(storeName)
                        .delete(key);

                    request.onsuccess = function (event) {
                        callback();
                    };
                    request.onerror = function (event) {
                        callback(event.target.error);
                    }
                } else {
                    callback(hasError);
                }
            });
        }
    }
}

//
//var test = DB("test");
//
//test.add({id: 1, name: "abc", age: 1}, function (error) {
//    if (error) {
//        console.log(error)
//    }
//});
//
//test.read(1, function (error, data) {
//    console.log('read', data);
//});
//
//
//test.read(100, function (error, data) {
//    console.log('read', data);
//});
//
//test.update({id: 1, name: "qqq", password: "123"}, function (error, data) {
//    console.log('update', data);
//});
//
//test.add({id: 2, name: "aaa", age: 3}, function (error) {
//    if (error) {
//        console.log('add', error);
//    }
//});
//
//test.add({id: 3, name: "dada", age: 3}, function (error) {
//    if (error) {
//        console.log('add', error);
//    }
//});
//
//test.remove(2, function (error, data) {
//    if (error) console.log(error);
//});
//
//
//test.save({id: 3, name: "33333333" + new Date().getTime(), age: 3}, function (error) {
//    if (error) {
//        console.log('add', error);
//    }
//});
//
//test.readAll(function (error, data) {
//    if (!error) {
//        console.log('readAll', data);
//    } else {
//        console.error('readAll', error);
//    }
//
//});