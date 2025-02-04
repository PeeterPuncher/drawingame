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
        
                $sql = "INSERT INTO rooms (name, code) VALUES ('$room_name', '$room_code')";
        
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

        else if ($action == 'join-room')
        {

        }

////////////////////////////////////////////////////////////////////////////////////////////////////////

        else if ($action == 'leave-room')
        {

        }

////////////////////////////////////////////////////////////////////////////////////////////////////////

        else if ($action == 'get-lobby')
        {
                echo json_encode(['status' => 'success', 'data' => 'php says hi']);
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
        echo json_encode(['status' => 'error', 'data' => 'Invalid request method']);
}


