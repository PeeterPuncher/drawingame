<?php
require 'database.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

// Handle preflight (OPTIONS) requests
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS')
{
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] == 'POST')
{
        $data = json_decode(file_get_contents("php://input"), true);

    if (isset($data['action']))
    {
        $action = $data['action'];

////////////////////////////////////////////////////////////////////////////////////////////////////////
        
        if ($action == 'create-room')
        {
                $room_name = $data['room_name'];
                $room_code = $data['room_code'];
        
                if ($room_name != "")
                {
                        $sql = "INSERT INTO rooms (name, code) VALUES ('$room_name', '$room_code')";
                }
                else
                {
                        $sql = "INSERT INTO rooms (name, code) VALUES ('room $room_code', '$room_code')";
                }
                
        
                if (mysqli_query($conn, $sql))
                {
                        echo json_encode(['status' => 'success', 'data' => $room_code]);
                }
                else
                {
                        echo json_encode(['status' => 'error', 'data' => 'Error creating room']);
                }
        }

///////////////////////////////////////////////////////////////////////////////////////////////////////

        else if ($action == 'get-lobby')
        {
                $sql = "SELECT name, code FROM rooms";
                $rooms = array();

                $result = mysqli_query($conn, $sql);
                while ($row = mysqli_fetch_array($result))
                {
                        $rooms[] = ['name' => $row['name'], 'code' => $row['code']];
                }
                echo json_encode(['status'=> 'success','data'=> $rooms]);
        }

///////////////////////////////////////////////////////////////////////////////////////////////////////

        else if ($action == 'join-room')
        {
                
        }

////////////////////////////////////////////////////////////////////////////////////////////////////////

        else if ($action == 'leave-room')
        {

        }

////////////////////////////////////////////////////////////////////////////////////////////////////////

        else if ($action == 'message')
        {
            
        }

////////////////////////////////////////////////////////////////////////////////////////////////////////

        else
        {
                echo json_encode(['status' => 'error', 'data' => 'Invalid action']);   
        }
    }
    else
    {
        echo json_encode(['status' => 'error', 'data' => 'Invalid request']);
    }
}
else
{
        echo json_encode(['status'=> 'error', 'data'=> 'Invalid request']);
}


mysqli_close($conn);